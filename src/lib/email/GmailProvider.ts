import "server-only";
import { google, gmail_v1 } from "googleapis";
import type { EmailProvider } from "./EmailProvider";
import type { RawEmail } from "@/types/pipeline";
import { ATS_DOMAINS } from "@/lib/jobDomains";

/**
 * Deterministic pre-filter applied at the Gmail search-query level so we never
 * pull the whole mailbox — only messages that look job-related by sender
 * domain or subject keyword. This is intentionally broad (recall over
 * precision); the classifier stage narrows it down and is allowed to say
 * IRRELEVANT / JOB_ALERT.
 */
const JOB_SENDER_DOMAINS = ["linkedin.com", "naukri.com", ...ATS_DOMAINS];

const SUBJECT_KEYWORDS = [
  "application",
  "applied",
  "interview",
  "assessment",
  "screening",
  "offer",
  "rejected",
  "not moving forward",
  "thank you for applying",
  "application received",
  "next steps",
];

/** Only scan mail from roughly this far back — an application older than
 * this isn't actionable (interview windows, offer deadlines, etc. have long
 * since passed), and it keeps each scan bounded regardless of inbox age. */
const HISTORICAL_LOOKBACK_DAYS = 60;

function buildSearchQuery(sinceDate?: Date): string {
  const domainClause = JOB_SENDER_DOMAINS.map((d) => `from:${d}`).join(" OR ");
  const subjectClause = SUBJECT_KEYWORDS.map((k) => `subject:"${k}"`).join(" OR ");
  const since = sinceDate ?? new Date(Date.now() - HISTORICAL_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const afterClause = `after:${since.getUTCFullYear()}/${pad2(since.getUTCMonth() + 1)}/${pad2(since.getUTCDate())}`;
  return `((${domainClause}) OR (${subjectClause})) ${afterClause}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const MAX_HISTORICAL_MESSAGES = 500;

export interface GmailProviderOptions {
  accessToken: string;
  refreshToken: string | null;
  clientId: string;
  clientSecret: string;
  /** Called whenever googleapis silently refreshes the access token, so callers can persist it. */
  onAccessTokenRefreshed?: (newAccessToken: string) => Promise<void>;
}

export class GmailProvider implements EmailProvider {
  private gmail: gmail_v1.Gmail;

  constructor(options: GmailProviderOptions) {
    const oauth2Client = new google.auth.OAuth2(
      options.clientId,
      options.clientSecret
    );
    oauth2Client.setCredentials({
      access_token: options.accessToken,
      refresh_token: options.refreshToken ?? undefined,
    });
    oauth2Client.on("tokens", (tokens) => {
      if (tokens.access_token && options.onAccessTokenRefreshed) {
        void options.onAccessTokenRefreshed(tokens.access_token);
      }
    });
    this.gmail = google.gmail({ version: "v1", auth: oauth2Client });
  }

  async listHistoricalMessageIds(): Promise<{ messageIds: string[] }> {
    return this.listMessageIds(buildSearchQuery());
  }

  private async listMessageIds(query: string): Promise<{ messageIds: string[] }> {
    let pageToken: string | undefined;
    const collectedIds: string[] = [];

    do {
      const list = await withBackoff(() =>
        this.gmail.users.messages.list({ userId: "me", q: query, maxResults: 100, pageToken })
      );
      const ids = (list.data.messages ?? []).map((m) => m.id!).filter(Boolean);
      collectedIds.push(...ids);
      pageToken = list.data.nextPageToken ?? undefined;
    } while (pageToken && collectedIds.length < MAX_HISTORICAL_MESSAGES);

    return { messageIds: collectedIds };
  }

  async getCurrentCursor(): Promise<string> {
    const profile = await this.gmail.users.getProfile({ userId: "me" });
    return String(profile.data.historyId ?? "");
  }

  async fetchEmailById(id: string): Promise<RawEmail | null> {
    return this.fetchEmail(id);
  }

  async listMessageIdsSince(since: Date): Promise<{ messageIds: string[] }> {
    return this.listMessageIds(buildSearchQuery(since));
  }

  private async fetchEmail(messageId: string): Promise<RawEmail | null> {
    let res;
    try {
      res = await withBackoff(() =>
        this.gmail.users.messages.get({ userId: "me", id: messageId, format: "full" })
      );
    } catch (err) {
      // A message that was listed but has since been deleted (or moved out of
      // reach) is not a sync failure — skip it, as the EmailProvider contract says.
      const status = (err as { code?: number; status?: number }).code ?? (err as { status?: number }).status;
      if (status === 404) return null;
      throw err;
    }
    const msg = res.data;
    if (!msg) return null;

    const headers = msg.payload?.headers ?? [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? "";

    const from = getHeader("From");
    const fromEmailMatch = from.match(/<([^>]+)>/);
    const fromEmail = fromEmailMatch ? fromEmailMatch[1] : from;
    const fromDomain = fromEmail.split("@")[1]?.toLowerCase() ?? "";

    return {
      providerMessageId: messageId,
      threadId: msg.threadId ?? messageId,
      from: fromEmail,
      fromDomain,
      subject: getHeader("Subject"),
      body: extractPlainTextBody(msg.payload).slice(0, 4000),
      snippet: msg.snippet ?? "",
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)) : new Date(),
    };
  }
}

function extractPlainTextBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  const decode = (data: string) =>
    Buffer.from(data, "base64").toString("utf8");

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    return decode(payload.body.data);
  }

  if (payload.parts) {
    const plainPart = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plainPart?.body?.data) return decode(plainPart.body.data);

    const htmlPart = payload.parts.find((p) => p.mimeType === "text/html");
    if (htmlPart?.body?.data) return stripHtml(decode(htmlPart.body.data));

    for (const part of payload.parts) {
      const nested = extractPlainTextBody(part);
      if (nested) return nested;
    }
  }

  if (payload.mimeType === "text/html" && payload.body?.data) {
    return stripHtml(decode(payload.body.data));
  }

  return "";
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function httpStatus(err: unknown): number | undefined {
  const e = err as { code?: unknown; status?: unknown };
  const n = Number(e.code ?? e.status);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Gmail enforces per-user, per-minute quota units. A 429 (or a 403 that names a
 * rate limit) is transient, so retry a few times with growing delays instead of
 * failing the whole sync.
 */
async function withBackoff<T>(call: () => Promise<T>, attempts = 4): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      const status = httpStatus(err);
      const message = err instanceof Error ? err.message : "";
      const retryable = status === 429 || (status === 403 && /rate|quota/i.test(message));
      if (!retryable || attempt >= attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
    }
  }
}
