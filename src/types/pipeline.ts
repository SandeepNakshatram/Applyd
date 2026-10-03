import type {
  ApplicationSource,
  ApplicationStatus,
  EmailEventType,
} from "@/generated/prisma";

/** A normalized email, independent of which provider it came from. */
export interface RawEmail {
  /** Provider-scoped unique id (Gmail message id). Used for dedup. */
  providerMessageId: string;
  threadId: string;
  from: string;
  fromDomain: string;
  subject: string;
  /** Plain-text body, truncated to what the pipeline needs. Never sent to the frontend. */
  body: string;
  snippet: string;
  receivedAt: Date;
}

export interface ClassificationResult {
  eventType: EmailEventType;
  confidence: number;
  reasoning?: string;
  /**
   * Which stage actually produced this result. Lets callers tell a real model
   * answer from a silent fall-back to the rule-based heuristics (e.g. when the
   * Gemini quota is exhausted) — re-analysis refuses to overwrite data with the
   * weaker fallback.
   */
  engine?: "deterministic" | "gemini" | "heuristic";
}

export interface ExtractionResult {
  company: string | null;
  role: string | null;
  applicationDate: string | null; // ISO date, or null
  source: ApplicationSource | null;
  status: ApplicationStatus | null;
  eventType: EmailEventType;
  confidence: number;
  /** Job/application/ATS identifiers found in the email, used by the resolver. */
  atsIdentifier: string | null;
}

export interface PipelineIngestResult {
  outcome:
    | "IGNORED_ALREADY_PROCESSED"
    | "IGNORED_IRRELEVANT"
    | "IGNORED_JOB_ALERT"
    | "IGNORED_RECRUITER_OUTREACH"
    | "APPLICATION_CREATED"
    | "EVENT_ADDED_NO_NOTIFICATION"
    | "EVENT_ADDED_WITH_NOTIFICATION"
    | "SENT_TO_REVIEW";
  applicationId?: string;
  eventId?: string;
  notificationId?: string;
}
