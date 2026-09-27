import type { RawEmail } from "@/types/pipeline";

/**
 * Provider-agnostic mailbox access. GmailProvider is the only implementation
 * in V1; future direct integrations (e.g. a provider that reads from an ATS
 * webhook instead of email) can implement the same surface.
 */
export interface EmailProvider {
  /**
   * Full historical scan. Yields batches of normalized emails so the caller
   * can report real progress instead of a single blocking call.
   */
  scanHistorical(onBatch: (batch: RawEmail[]) => Promise<void>): Promise<{
    totalScanned: number;
    /** Provider-specific cursor to resume incremental sync from (Gmail historyId). */
    cursor: string;
  }>;

  /**
   * Incremental sync since the last known cursor. Returns new emails plus the
   * updated cursor. Must be safe to call repeatedly (idempotent) — the caller
   * still deduplicates by providerMessageId.
   */
  syncIncremental(sinceCursor: string): Promise<{
    emails: RawEmail[];
    cursor: string;
  }>;
}
