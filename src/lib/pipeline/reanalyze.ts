import "server-only";
import { prisma } from "@/lib/prisma";
import type { AIClient } from "@/lib/ai/types";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import type { PipelineIngestResult, RawEmail } from "@/types/pipeline";
import { analyzeEmail, ingestAnalyzedEmail, type EmailAnalysis } from "./ingest";

export type ReanalyzeResult =
  | { status: "UPDATED"; applicationId: string }
  | { status: "REMOVED"; reason: string }
  | { status: "UNAVAILABLE"; reason: string }
  | { status: "AI_UNAVAILABLE"; reason: string };

const REMOVED_REASONS: Partial<Record<PipelineIngestResult["outcome"], string>> = {
  IGNORED_JOB_ALERT: "That was a job-board advertisement, not an application — removed.",
  IGNORED_IRRELEVANT: "That wasn't a job application — removed.",
  IGNORED_RECRUITER_OUTREACH: "That was recruiter outreach you hadn't applied to — removed.",
};

/**
 * Re-runs the full pipeline on the email(s) an application was built from and
 * replaces the application with the result. This is how an item that was
 * extracted badly (e.g. during a model outage) gets fixed without a database
 * edit: the application may come back corrected, merge into the application
 * it really belongs to, or disappear if it turns out not to be a job
 * application at all.
 *
 * Order matters for safety: everything that can fail for external reasons
 * (Gmail fetch, AI call) happens BEFORE anything is deleted, and a result that
 * came from the rule-based fallback instead of the real model is refused when
 * a model is configured — otherwise a quota hiccup would just overwrite the
 * data with something worse.
 */
export async function reanalyzeApplication(params: {
  userId: string;
  connectedAccountId: string;
  applicationId: string;
  provider: EmailProvider;
  aiClient: AIClient;
  /** True when a real model is configured, so a heuristic fallback means "AI unavailable". */
  requireModel: boolean;
}): Promise<ReanalyzeResult> {
  const { userId, connectedAccountId, applicationId, provider, aiClient, requireModel } = params;

  const application = await prisma.application.findFirst({
    where: { id: applicationId, userId },
    include: { events: { where: { emailId: { not: null } } } },
  });
  if (!application) return { status: "UNAVAILABLE", reason: "Application not found." };

  const emailIds = [...new Set(application.events.map((e) => e.emailId!).filter(Boolean))];
  if (emailIds.length === 0) {
    return { status: "UNAVAILABLE", reason: "This application has no source email (it was added manually)." };
  }

  const fetched = await Promise.all(emailIds.map((id) => provider.fetchEmailById(id)));
  if (fetched.some((e) => e === null)) {
    return {
      status: "UNAVAILABLE",
      reason: "One of the source emails is no longer in Gmail, so it can't be re-analyzed.",
    };
  }
  const emails = (fetched as RawEmail[]).sort((a, b) => a.receivedAt.getTime() - b.receivedAt.getTime());

  const analyses: { email: RawEmail; analysis: EmailAnalysis }[] = [];
  for (const email of emails) {
    const analysis = await analyzeEmail(email, aiClient);
    if (requireModel && analysis.classification.engine === "heuristic") {
      return {
        status: "AI_UNAVAILABLE",
        reason: "The AI model didn't respond (quota or outage), so nothing was changed. Try again shortly.",
      };
    }
    analyses.push({ email, analysis });
  }

  await prisma.$transaction([
    prisma.notification.deleteMany({ where: { applicationId } }),
    prisma.application.delete({ where: { id: applicationId } }),
    prisma.processedEmail.deleteMany({
      where: { connectedAccountId, providerMessageId: { in: emailIds } },
    }),
  ]);

  const results: PipelineIngestResult[] = [];
  for (const { email, analysis } of analyses) {
    results.push(
      await ingestAnalyzedEmail({ userId, connectedAccountId, email, analysis, notify: false })
    );
  }

  const kept = results.find((r) => r.applicationId);
  if (kept?.applicationId) return { status: "UPDATED", applicationId: kept.applicationId };

  return {
    status: "REMOVED",
    reason: (results[0] ? REMOVED_REASONS[results[0].outcome] : undefined) ?? "No application was found in that email — removed.",
  };
}
