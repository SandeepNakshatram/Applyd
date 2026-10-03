import "server-only";
import { prisma } from "@/lib/prisma";
import type { AIClient } from "@/lib/ai/types";
import { postProcessExtraction } from "@/lib/ai/postprocess";
import type {
  ClassificationResult,
  ExtractionResult,
  PipelineIngestResult,
  RawEmail,
} from "@/types/pipeline";
import { resolveApplication } from "./resolver";

/** The AI half of ingestion: pure analysis, no database writes. */
export interface EmailAnalysis {
  classification: ClassificationResult;
  /** null for JOB_ALERT / IRRELEVANT — those never reach the resolver. */
  extraction: ExtractionResult | null;
}

export async function analyzeEmail(email: RawEmail, aiClient: AIClient): Promise<EmailAnalysis> {
  const classification = await aiClient.classifyEmail(email);

  if (classification.eventType === "IRRELEVANT" || classification.eventType === "JOB_ALERT") {
    return { classification, extraction: null };
  }

  const raw = await aiClient.extractApplication(email, classification);
  return { classification, extraction: postProcessExtraction(email, raw) };
}

/**
 * The database half: records the email as processed and, for application
 * mail, resolves it into an Application/ApplicationEvent/Notification.
 * `notify: false` suppresses notifications (used when re-analysing an email the
 * user has already been told about).
 */
export async function ingestAnalyzedEmail(params: {
  userId: string;
  connectedAccountId: string;
  email: RawEmail;
  analysis: EmailAnalysis;
  notify?: boolean;
}): Promise<PipelineIngestResult> {
  const { userId, connectedAccountId, email, analysis, notify = true } = params;
  const { classification, extraction } = analysis;

  if (!extraction) {
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

  const result = await resolveApplication({ userId, email, extraction, notify });

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
  notify?: boolean;
}): Promise<PipelineIngestResult> {
  const { userId, connectedAccountId, email, aiClient, notify } = params;

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

  const analysis = await analyzeEmail(email, aiClient);
  return ingestAnalyzedEmail({ userId, connectedAccountId, email, analysis, notify });
}
