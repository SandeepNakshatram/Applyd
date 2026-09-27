import "server-only";
import { prisma } from "@/lib/prisma";
import { getAIClient } from "@/lib/ai";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import { ingestEmail } from "./ingest";
import type { PipelineIngestResult } from "@/types/pipeline";

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
 * Runs the full historical scan for a newly connected mailbox, updating the
 * ScanJob row as it goes so the frontend can poll real (not simulated)
 * progress. Intended to be kicked off with next/server's `after()` so the
 * connect request can respond immediately.
 */
export async function processInitialScan(params: {
  scanJobId: string;
  userId: string;
  connectedAccountId: string;
  provider: EmailProvider;
}): Promise<void> {
  const { scanJobId, userId, connectedAccountId, provider } = params;
  const aiClient = getAIClient();

  try {
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "SCANNING_EMAILS" },
    });

    let scanned = 0;
    let relevantCount = 0;
    let applicationsFound = 0;
    let needsReviewCount = 0;
    let stageAdvanced = false;

    const { cursor } = await provider.scanHistorical(async (batch) => {
      if (!stageAdvanced) {
        await prisma.scanJob.update({
          where: { id: scanJobId },
          data: { stage: "IDENTIFYING_JOB_EMAILS" },
        });
        stageAdvanced = true;
      }

      for (const email of batch) {
        scanned += 1;
        const result = await ingestEmail({ userId, connectedAccountId, email, aiClient });
        const counts = countsForOutcome(result.outcome);
        if (counts.relevant) relevantCount += 1;
        if (counts.applicationFound) applicationsFound += 1;
        if (counts.needsReview) needsReviewCount += 1;
      }

      await prisma.scanJob.update({
        where: { id: scanJobId },
        data: {
          stage: "EXTRACTING_INFO",
          emailsScanned: scanned,
          emailsRelevant: relevantCount,
          applicationsFound,
          needsReviewCount,
        },
      });
    });

    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "MATCHING_APPLICATIONS" },
    });
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "BUILDING_TIMELINES" },
    });
    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "CREATING_NOTIFICATIONS" },
    });

    await prisma.connectedAccount.update({
      where: { id: connectedAccountId },
      data: { historyId: cursor, lastSyncedAt: new Date() },
    });

    await prisma.scanJob.update({
      where: { id: scanJobId },
      data: { stage: "COMPLETE", completedAt: new Date() },
    });
  } catch (err) {
    await prisma.scanJob.update({
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
