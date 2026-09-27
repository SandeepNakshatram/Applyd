import "server-only";
import { addDays } from "date-fns";
import type { Application, EmailEventType, Prisma } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { ExtractionResult, PipelineIngestResult, RawEmail } from "@/types/pipeline";
import { notifyNewApplication, notifyReviewNeeded, notifyStatusChange } from "./notifications";

/** Below this, a resolved application is routed to the Review Queue instead of the dashboard. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

interface NextAction {
  nextAction: string | null;
  nextActionDate: Date | null;
}

function deriveNextAction(eventType: EmailEventType, from: Date): NextAction {
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

async function findMatchingApplication(
  userId: string,
  extraction: ExtractionResult
): Promise<Application | null> {
  if (extraction.atsIdentifier) {
    const byAts = await prisma.application.findFirst({
      where: { userId, atsIdentifier: extraction.atsIdentifier },
    });
    if (byAts) return byAts;
  }

  if (extraction.company && extraction.role) {
    const byCompanyRole = await prisma.application.findFirst({
      where: {
        userId,
        company: { equals: extraction.company, mode: "insensitive" },
        role: { equals: extraction.role, mode: "insensitive" },
      },
      orderBy: { createdAt: "desc" },
    });
    if (byCompanyRole) return byCompanyRole;
  }

  return null;
}

export async function resolveApplication(params: {
  userId: string;
  email: RawEmail;
  extraction: ExtractionResult;
}): Promise<PipelineIngestResult> {
  const { userId, email, extraction } = params;
  const source = extraction.source ?? "OTHER";

  const existing = await findMatchingApplication(userId, extraction);

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

    const event = await prisma.applicationEvent.create({
      data: {
        applicationId: existing.id,
        eventType: extraction.eventType,
        status: extraction.status,
        timestamp: email.receivedAt,
        source,
        emailId: email.providerMessageId,
        extractedData: extraction as unknown as Prisma.InputJsonValue,
        confidence: extraction.confidence,
      },
    });

    const nextAction = deriveNextAction(extraction.eventType, email.receivedAt);
    const enteringReview =
      existing.reviewState !== "PENDING" && extraction.confidence < REVIEW_CONFIDENCE_THRESHOLD;

    const updated = await prisma.application.update({
      where: { id: existing.id },
      data: {
        currentStatus: extraction.status ?? existing.currentStatus,
        nextAction: nextAction.nextAction,
        nextActionDate: nextAction.nextActionDate,
        ...(enteringReview ? { reviewState: "PENDING" } : {}),
      },
    });

    const notification = enteringReview
      ? await notifyReviewNeeded(userId, updated)
      : await notifyStatusChange(userId, updated, extraction.eventType);

    return {
      outcome: "EVENT_ADDED_WITH_NOTIFICATION",
      applicationId: existing.id,
      eventId: event.id,
      notificationId: notification.id,
    };
  }

  const needsReview =
    extraction.confidence < REVIEW_CONFIDENCE_THRESHOLD || !extraction.company || !extraction.role;
  const nextAction = deriveNextAction(extraction.eventType, email.receivedAt);

  const application = await prisma.application.create({
    data: {
      userId,
      company: extraction.company ?? "Unknown company",
      role: extraction.role ?? "Unknown role",
      source,
      appliedAt:
        extraction.eventType === "APPLICATION_CONFIRMATION"
          ? extraction.applicationDate
            ? new Date(extraction.applicationDate)
            : email.receivedAt
          : null,
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
      emailId: email.providerMessageId,
      extractedData: extraction as unknown as Prisma.InputJsonValue,
      confidence: extraction.confidence,
    },
  });

  const notification = needsReview
    ? await notifyReviewNeeded(userId, application)
    : await notifyNewApplication(userId, application);

  return {
    outcome: needsReview ? "SENT_TO_REVIEW" : "APPLICATION_CREATED",
    applicationId: application.id,
    eventId: event.id,
    notificationId: notification.id,
  };
}
