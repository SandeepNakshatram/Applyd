import "server-only";
import { prisma } from "@/lib/prisma";
import type { AIClient } from "@/lib/ai/types";
import type { PipelineIngestResult, RawEmail } from "@/types/pipeline";
import { resolveApplication } from "./resolver";

/**
 * Single entry point for turning one inbound email into (at most) an
 * ApplicationEvent + Notification. Used identically by the historical scan,
 * incremental sync, and the test suite, so behavior is guaranteed the same
 * everywhere emails enter the system.
 *
 * EMAIL -> RELEVANCE CLASSIFICATION -> STRUCTURED EXTRACTION -> APPLICATION
 * RESOLUTION -> APPLICATION EVENT -> STATUS UPDATE -> NOTIFICATION DECISION
 */
export async function ingestEmail(params: {
  userId: string;
  connectedAccountId: string;
  email: RawEmail;
  aiClient: AIClient;
}): Promise<PipelineIngestResult> {
  const { userId, connectedAccountId, email, aiClient } = params;

  const alreadyProcessed = await prisma.processedEmail.findUnique({
    where: {
      connectedAccountId_providerMessageId: {
        connectedAccountId,
        providerMessageId: email.providerMessageId,
      },
    },
  });
  if (alreadyProcessed) {
    return { outcome: "IGNORED_ALREADY_PROCESSED" };
  }

  const classification = await aiClient.classifyEmail(email);

  if (classification.eventType === "IRRELEVANT" || classification.eventType === "JOB_ALERT") {
    await prisma.processedEmail.create({
      data: {
        connectedAccountId,
        providerMessageId: email.providerMessageId,
        eventType: classification.eventType,
      },
    });
    return {
      outcome: classification.eventType === "JOB_ALERT" ? "IGNORED_JOB_ALERT" : "IGNORED_IRRELEVANT",
    };
  }

  const extraction = await aiClient.extractApplication(email, classification);
  const result = await resolveApplication({ userId, email, extraction });

  await prisma.processedEmail.create({
    data: {
      connectedAccountId,
      providerMessageId: email.providerMessageId,
      eventType: classification.eventType,
      createdEventId: result.eventId,
    },
  });

  return result;
}
