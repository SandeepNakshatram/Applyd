import type { RawEmail } from "@/types/pipeline";

/**
 * Provider-agnostic mailbox access. GmailProvider is the only implementation
 * in V1; future direct integrations (e.g. a provider that reads from an ATS
 * webhook instead of email) can implement the same surface.
 */
export interface EmailProvider {
  /**
   * Lightweight listing of historical message IDs matching the relevance
   * pre-filter (no bodies fetched) — fast enough to run in a single request.
   * Callers fetch and ingest the actual emails afterwards, a few at a time
   * via `fetchEmailById`, so the work survives serverless duration limits.
   */
  listHistoricalMessageIds(): Promise<{ messageIds: string[] }>;

  /** Fetches one full message by provider id. Returns null if it's gone. */
  fetchEmailById(id: string): Promise<RawEmail | null>;

  /** Current provider-specific cursor to resume incremental sync from (Gmail historyId). */
  getCurrentCursor(): Promise<string>;

  /**
   * Ids of relevant mail received since `since` (day granularity, newest
   * first), without downloading any bodies. Incremental sync uses this instead
   * of a provider history cursor: it can't expire, and the caller skips ids it
   * has already processed before fetching anything.
   */
  listMessageIdsSince(since: Date): Promise<{ messageIds: string[] }>;
}
