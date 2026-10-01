import "server-only";
import { prisma } from "@/lib/prisma";
import { getAIClient } from "@/lib/ai";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import { ingestEmail } from "./ingest";
import type { PipelineIngestResult } from "@/types/pipeline";
import { Prisma, type ScanJob } from "@/generated/prisma";

/** Emails processed per `continueInitialScan` call — small enough that even a
 * slow AI-backed chunk finishes comfortably within a serverless function's
 * duration limit. */
const CHUNK_SIZE = 15;

function countsForOutcome(outcome: PipelineIngestResult["outcome"]) {
  const relevant = outcome !== "IGNORED_ALREADY_PROCESSED" && outcome !== "IGNORED_IRRELEVANT" && outcome !== "IGNORED_JOB_ALERT";
  const applicationFound = outcome === "APPLICATION_CREATED" || outcome === "SENT_TO_REVIEW";
  const needsReview = outcome === "SENT_TO_REVIEW";
  return { relevant, applicationFound, needsReview };
}

export async function createScanJob(params: {
  userId: string;
  connectedAccountId: string;
  type: "INITIAL" | "INCREMENTAL";
}) {
  return prisma.scanJob.create({
    data: {
      userId: params.userId,
      connectedAccountId: params.connectedAccountId,
      type: params.type,
      stage: "CONNECTING",
    },
  });
}

/**
 * Phase A of the initial scan: one lightweight Gmail listing call (IDs only,
 * no bodies), fast enough to run inline in the request that starts the scan.
 * The resulting message IDs are stored on the ScanJob row and drained a
 * small chunk at a time by `continueInitialScan` — no single request ever
 * has to process the whole mailbox. (Running the *entire* scan inside one
 * `after()` background task is what silently killed scans in production:
 * Vercel's function duration limit cut it off mid-scan with no error, since
 * a platform-level kill never reaches our own try/catch.)
 */
export async function startInitialScan(params: {
  scanJobId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { scanJobId, provider } = params;

  await prisma.scanJob.update({
    where: { id: scanJobId },
    data: { stage: "SCANNING_EMAILS", lastProgressAt: new Date() },
  });

  const { messageIds } = await provider.listHistoricalMessageIds();

  await prisma.scanJob.update({
    where: { id: scanJobId },
    data: {
      stage: "IDENTIFYING_JOB_EMAILS",
      pendingMessageIds: messageIds,
      lastProgressAt: new Date(),
    },
  });
}

/**
 * Phase B: processes one bounded chunk of the pending message IDs and
 * returns the updated ScanJob. Meant to be called repeatedly (once per
 * frontend poll) until `stage` is COMPLETE or FAILED.
 */
export async function continueInitialScan(params: {
  scanJobId: string;
  userId: string;
  connectedAccountId: string;
  provider: EmailProvider;
}): Promise<ScanJob> {
  const { scanJobId, userId, connectedAccountId, provider } = params;

  // Claim the next chunk atomically: lock the row for the duration of this
  // transaction so two overlapping callers (e.g. a refreshed scan page
  // racing a still-running loop from before the refresh) can never both
  // claim the same message IDs — without this, both would ingest the same
  // email concurrently and crash on ApplicationEvent's unique emailId
  // constraint instead of the normal "already processed" dedup path ever
  // getting a chance to run.
  const claim = await prisma.$transaction(async (tx) => {
    const [job] = await tx.$queryRaw<ScanJob[]>`SELECT * FROM scan_jobs WHERE id = ${scanJobId} FOR UPDATE`;
    if (!job) throw new Error("Scan job not found");
    if (job.stage === "COMPLETE" || job.stage === "FAILED") {
      return { job, chunk: [] as string[], isDone: true, alreadyFinished: true };
    }

    const pending = Array.isArray(job.pendingMessageIds) ? (job.pendingMessageIds as string[]) : [];
    const chunk = pending.slice(0, CHUNK_SIZE);
    const remaining = pending.slice(CHUNK_SIZE);

    const updated = await tx.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "EXTRACTING_INFO", pendingMessageIds: remaining, lastProgressAt: new Date() },
    });

    return { job: updated, chunk, isDone: remaining.length === 0, alreadyFinished: false };
  });

  if (claim.alreadyFinished) return claim.job;

  try {
    const aiClient = getAIClient();

    // Fetch concurrently (independent network calls), but ingest one at a
    // time — the resolver does a check-then-act read/write against shared
    // Application rows, and concurrent ingestion could race two emails
    // destined for the same application.
    const emails = await Promise.all(claim.chunk.map((id) => provider.fetchEmailById(id)));

    let scanned = 0;
    let relevantCount = 0;
    let applicationsFound = 0;
    let needsReviewCount = 0;
    for (const email of emails) {
      if (!email) continue;
      scanned += 1;
      try {
        const result = await ingestEmail({ userId, connectedAccountId, email, aiClient });
        const counts = countsForOutcome(result.outcome);
        if (counts.relevant) relevantCount += 1;
        if (counts.applicationFound) applicationsFound += 1;
        if (counts.needsReview) needsReviewCount += 1;
      } catch (err) {
        // Defense-in-depth: the chunk claim above already prevents two scan
        // continuations from processing the same email, but an incremental
        // sync (cron) could in principle race the same message independently.
        // Treat a duplicate-key error on this one email as "already
        // processed" rather than failing the entire chunk over it.
        const isDuplicateKey =
          err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
        if (!isDuplicateKey) throw err;
      }
    }

    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: {
        emailsScanned: { increment: scanned },
        emailsRelevant: { increment: relevantCount },
        applicationsFound: { increment: applicationsFound },
        needsReviewCount: { increment: needsReviewCount },
        lastProgressAt: new Date(),
      },
    });

    if (!claim.isDone) {
      return await prisma.scanJob.findUniqueOrThrow({ where: { id: scanJobId } });
    }

    // Last chunk processed — finalize. The FOR UPDATE claim above guarantees
    // exactly one caller ever observes isDone for a given scan job, so this
    // can't race another finalization.
    await prisma.scanJob.update({ where: { id: scanJobId }, data: { stage: "MATCHING_APPLICATIONS" } });
    await prisma.scanJob.update({ where: { id: scanJobId }, data: { stage: "BUILDING_TIMELINES" } });
    await prisma.scanJob.update({ where: { id: scanJobId }, data: { stage: "CREATING_NOTIFICATIONS" } });

    const cursor = await provider.getCurrentCursor();
    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { historyId: cursor, lastSyncedAt: new Date() },
    });

    return await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "COMPLETE", completedAt: new Date() },
    });
  } catch (err) {
    return prisma.scanJob.update({
      where: { id: scanJobId },
      data: {
        stage: "FAILED",
        error: err instanceof Error ? err.message : "Unknown scan error",
        completedAt: new Date(),
      },
    });
  }
}

/**
 * Incremental sync for an already-connected mailbox. Invoked server-side
 * only (cron route / Gmail push webhook) — never from client-side polling.
 */
export async function processIncrementalSync(params: {
  userId: string;
  connectedAccountId: string;
  provider: EmailProvider;
  sinceCursor: string;
}): Promise<{ newEmails: number; notificationsCreated: number }> {
  const { userId, connectedAccountId, provider, sinceCursor } = params;
  const aiClient = getAIClient();

  const { emails, cursor } = await provider.syncIncremental(sinceCursor);

  let notificationsCreated = 0;
  for (const email of emails) {
    const result = await ingestEmail({ userId, connectedAccountId, email, aiClient });
    if (result.notificationId) notificationsCreated += 1;
  }

  await prisma.connectedAccount.update({
    where: { id: connectedAccountId },
    data: { historyId: cursor, lastSyncedAt: new Date() },
  });

  return { newEmails: emails.length, notificationsCreated };
}
