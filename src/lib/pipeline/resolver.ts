import "server-only";
import { addDays } from "date-fns";
import type { Application, EmailEventType, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { ExtractionResult, PipelineIngestResult, RawEmail } from "@/types/pipeline";
import { UNKNOWN_COMPANY, UNKNOWN_ROLE } from "@/lib/placeholders";
import { roleKey, sameCompany } from "@/lib/companyKey";
import { notifyNewApplication, notifyReviewNeeded, notifyStatusChange } from "./notifications";

/** Below this, a resolved application is routed to the Review Queue instead of the dashboard. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

/**
 * A fresh "applied" confirmation for the same company+role, arriving this
 * long after the matched application's appliedAt, is treated as a genuine
 * second application rather than folded into the old one — e.g. reapplying
 * to a role that went nowhere the first time. Matching by an explicit
 * atsIdentifier is unaffected: that's a strong enough signal to always merge
 * on (and a real reapplication normally gets its own new ATS id anyway).
 */
const REAPPLICATION_GAP_DAYS = 90;

interface NextAction {
  nextAction: string | null;
  nextActionDate: Date | null;
}

/** What the email itself said to do next/when wins; otherwise a sensible default for the stage. */
function deriveNextAction(extraction: ExtractionResult, from: Date): NextAction {
  const fallback = defaultNextAction(extraction.eventType, from);
  const stated = extraction.nextAction?.trim();
  const date = extraction.eventDate ? new Date(extraction.eventDate) : null;
  return {
    nextAction: stated ? stated.slice(0, 120) : fallback.nextAction,
    nextActionDate: date && !Number.isNaN(date.getTime()) ? date : fallback.nextActionDate,
  };
}

/** Sender/subject/snippet kept on the event so the timeline can show what each step was detected from. */
function eventData(email: RawEmail, extraction: ExtractionResult): Prisma.InputJsonValue {
  return {
    ...extraction,
    email: {
      from: email.from,
      subject: email.subject.slice(0, 200),
      snippet: email.snippet.slice(0, 160),
    },
  } as unknown as Prisma.InputJsonValue;
}

function defaultNextAction(eventType: EmailEventType, from: Date): NextAction {
  switch (eventType) {
    case "APPLICATION_CONFIRMATION":
      return { nextAction: "Awaiting response", nextActionDate: null };
    case "SCREENING":
      return { nextAction: "Awaiting recruiter response", nextActionDate: null };
    case "ASSESSMENT":
      return { nextAction: "Complete assessment", nextActionDate: addDays(from, 5) };
    case "INTERVIEW":
      return { nextAction: "Prepare for interview", nextActionDate: null };
    case "OFFER":
      return { nextAction: "Respond to offer", nextActionDate: addDays(from, 7) };
    case "REJECTION":
    case "APPLICATION_STATUS_UPDATE":
    case "RECRUITER_OUTREACH":
    default:
      return { nextAction: null, nextActionDate: null };
  }
}

/**
 * Deterministic matching, strongest signal first:
 *   1. explicit ATS / candidate / application id
 *   2. company + role (case-insensitive), unless it's a fresh application
 *      long after the matched one (see REAPPLICATION_GAP_DAYS)
 *   3. company alone, when the email names no role (e.g. an interview invite)
 *      and the user has exactly ONE open application there — or when the
 *      email names a role and exactly one open application at that company
 *      still has a placeholder role. Ambiguity (several candidates) means no
 *      match: wrongly merging two applications is worse than a duplicate the
 *      user can see and ignore.
 */
async function findMatchingApplication(
  userId: string,
  email: RawEmail,
  extraction: ExtractionResult
): Promise<Application | null> {
  if (extraction.atsIdentifier) {
    const byAts = await prisma.application.findFirst({
      where: { userId, atsIdentifier: extraction.atsIdentifier },
    });
    if (byAts) return byAts;
  }

  if (!extraction.company || extraction.company === UNKNOWN_COMPANY) return null;

  // Company names are compared through companyKey (legal suffixes, accents and
  // punctuation folded away), which can't be expressed as a SQL equality, so the
  // user's applications are loaded once and filtered here — a user has tens of
  // applications, not millions.
  const company = extraction.company;
  const sameCo = (await prisma.application.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  })).filter((a) => sameCompany(a.company, company));

  if (extraction.role) {
    const wanted = roleKey(extraction.role);
    const byCompanyRole = sameCo.find((a) => roleKey(a.role) === wanted) ?? null;

    if (byCompanyRole) {
      if (extraction.eventType === "APPLICATION_CONFIRMATION" && byCompanyRole.appliedAt) {
        const newAppliedAt = extraction.applicationDate
          ? new Date(extraction.applicationDate)
          : email.receivedAt;
        const gapDays =
          (newAppliedAt.getTime() - byCompanyRole.appliedAt.getTime()) / (1000 * 60 * 60 * 24);
        if (gapDays > REAPPLICATION_GAP_DAYS) {
          // Treat as a new, separate application attempt rather than
          // reopening/overwriting the old one.
          return null;
        }
      }
      return byCompanyRole;
    }
  }

  const openAtCompany = sameCo.filter(
    (a) =>
      a.currentStatus !== "REJECTED" &&
      a.currentStatus !== "WITHDRAWN" &&
      a.reviewState !== "IGNORED" &&
      (!extraction.role || a.role === UNKNOWN_ROLE)
  );
  return openAtCompany.length === 1 ? openAtCompany[0] : null;
}

export async function resolveApplication(params: {
  userId: string;
  /** The mailbox the email came from; scopes event de-duplication. */
  connectedAccountId: string;
  email: RawEmail;
  extraction: ExtractionResult;
  /** false suppresses in-app notifications (re-analysis of something the user already saw). */
  notify?: boolean;
}): Promise<PipelineIngestResult> {
  const { userId, connectedAccountId, email, extraction, notify = true } = params;
  const source = extraction.source ?? "OTHER";

  const send = async <T extends { id: string }>(fn: () => Promise<T>): Promise<string | undefined> =>
    notify ? (await fn()).id : undefined;

  const existing = await findMatchingApplication(userId, email, extraction);

  if (!existing && extraction.eventType === "RECRUITER_OUTREACH") {
    // Unsolicited outreach is a lead, not an application the user submitted.
    // It's only recorded when it belongs to an application we already track.
    return { outcome: "IGNORED_RECRUITER_OUTREACH" };
  }

  if (existing) {
    // A resend/duplicate notification of an update we've already recorded
    // (spec section 21: "an email must never generate duplicate events").
    // Keyed on (eventType, status) rather than just the most recent event so
    // an out-of-order resend of an *earlier* stage is still caught, not just
    // a repeat of the latest one. Known V1 limitation: a genuine second
    // occurrence of the same stage (e.g. a second interview round) would
    // also be treated as a duplicate — disambiguating that needs signals
    // beyond what deterministic matching covers in V1.
    const duplicateEvent = await prisma.applicationEvent.findFirst({
      where: {
        applicationId: existing.id,
        eventType: extraction.eventType,
        ...(extraction.status ? { status: extraction.status } : {}),
      },
    });

    if (duplicateEvent) {
      return { outcome: "IGNORED_ALREADY_PROCESSED", applicationId: existing.id };
    }

    // Mail isn't processed in chronological order (a scan lists newest first),
    // so an OLDER email arriving after a newer one must not drag the status,
    // next action or notifications backwards — it only fills in history.
    const latest = await prisma.applicationEvent.findFirst({
      where: { applicationId: existing.id },
      orderBy: { timestamp: "desc" },
      select: { timestamp: true },
    });
    const isNewest = !latest || email.receivedAt.getTime() >= latest.timestamp.getTime();

    const event = await prisma.applicationEvent.create({
      data: {
        applicationId: existing.id,
        eventType: extraction.eventType,
        status: extraction.status,
        timestamp: email.receivedAt,
        source,
        connectedAccountId,
        emailId: email.providerMessageId,
        extractedData: eventData(email, extraction),
        confidence: extraction.confidence,
      },
    });

    const nextAction = deriveNextAction(extraction, email.receivedAt);
    const enteringReview =
      existing.reviewState !== "PENDING" && extraction.confidence < REVIEW_CONFIDENCE_THRESHOLD;

    // The applied date is the earliest evidence we have: a stated date from a
    // confirmation is exact; otherwise the first email seen is an estimate.
    const confirmedDate =
      extraction.eventType === "APPLICATION_CONFIRMATION"
        ? extraction.applicationDate
          ? new Date(extraction.applicationDate)
          : email.receivedAt
        : null;
    const appliedUpdate: { appliedAt?: Date; appliedAtEstimated?: boolean } = {};
    if (confirmedDate) {
      if (!existing.appliedAt || existing.appliedAtEstimated || confirmedDate < existing.appliedAt) {
        appliedUpdate.appliedAt = confirmedDate;
        appliedUpdate.appliedAtEstimated = false;
      }
    } else if (!existing.appliedAt || (existing.appliedAtEstimated && email.receivedAt < existing.appliedAt)) {
      appliedUpdate.appliedAt = email.receivedAt;
      appliedUpdate.appliedAtEstimated = true;
    }

    const updated = await prisma.application.update({
      where: { id: existing.id },
      data: {
        ...appliedUpdate,
        ...(isNewest
          ? {
              currentStatus: extraction.status ?? existing.currentStatus,
              nextAction: nextAction.nextAction,
              nextActionDate: nextAction.nextActionDate,
            }
          : {}),
        // Learn from later mail: fill placeholders and the missing id, never overwrite real values.
        ...(extraction.company && existing.company === UNKNOWN_COMPANY ? { company: extraction.company } : {}),
        ...(extraction.role && existing.role === UNKNOWN_ROLE ? { role: extraction.role } : {}),
        ...(extraction.atsIdentifier && !existing.atsIdentifier
          ? { atsIdentifier: extraction.atsIdentifier }
          : {}),
        ...(enteringReview ? { reviewState: "PENDING" } : {}),
      },
    });

    // Telling the user "moved to Screening" about a step that's already behind
    // them would be noise; only the newest development notifies.
    const notificationId = isNewest
      ? await send(() =>
          enteringReview
            ? notifyReviewNeeded(userId, updated)
            : notifyStatusChange(userId, updated, extraction.eventType)
        )
      : undefined;

    return {
      outcome: isNewest ? "EVENT_ADDED_WITH_NOTIFICATION" : "EVENT_ADDED_NO_NOTIFICATION",
      applicationId: existing.id,
      eventId: event.id,
      notificationId,
    };
  }

  // What earns a place in the Review Queue is real uncertainty: low confidence,
  // no identifiable company, or a company we only guessed from the sender's
  // domain. A *missing role* is not uncertainty — "Thanks for applying" mail from
  // an ATS genuinely never names the job, the application certainly exists, and
  // later mail (or the user, inline) can supply it. Those go straight to the
  // dashboard as "Role not specified".
  const needsReview =
    extraction.confidence < REVIEW_CONFIDENCE_THRESHOLD ||
    !extraction.company ||
    extraction.companyInferred === true;
  const nextAction = deriveNextAction(extraction, email.receivedAt);
  const isConfirmation = extraction.eventType === "APPLICATION_CONFIRMATION";

  const application = await prisma.application.create({
    data: {
      userId,
      company: extraction.company ?? UNKNOWN_COMPANY,
      role: extraction.role ?? UNKNOWN_ROLE,
      source,
      // No confirmation email seen (we only found, say, the rejection): use the
      // earliest email's date and say it's an estimate rather than show nothing.
      appliedAt: isConfirmation && extraction.applicationDate ? new Date(extraction.applicationDate) : email.receivedAt,
      appliedAtEstimated: !isConfirmation,
      currentStatus: extraction.status ?? "APPLIED",
      confidence: extraction.confidence,
      reviewState: needsReview ? "PENDING" : "NONE",
      senderDomain: email.fromDomain,
      atsIdentifier: extraction.atsIdentifier,
      nextAction: nextAction.nextAction,
      nextActionDate: nextAction.nextActionDate,
    },
  });

  const event = await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      eventType: extraction.eventType,
      status: extraction.status,
      timestamp: email.receivedAt,
      source,
      connectedAccountId,
      emailId: email.providerMessageId,
      extractedData: eventData(email, extraction),
      confidence: extraction.confidence,
    },
  });

  const notificationId = await send(() =>
    needsReview
      ? notifyReviewNeeded(userId, application)
      : notifyNewApplication(userId, application, extraction.eventType)
  );

  return {
    outcome: needsReview ? "SENT_TO_REVIEW" : "APPLICATION_CREATED",
    applicationId: application.id,
    eventId: event.id,
    notificationId,
  };
}
