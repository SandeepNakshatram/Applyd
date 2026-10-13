import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import type { RawEmail } from "@/types/pipeline";
import { processIncrementalSync } from "@/lib/pipeline/scan";
import { createFollowUpReminders } from "@/lib/pipeline/sync";
import { mockEmails } from "./fixtures/mockEmails";

let userId: string;
let connectedAccountId: string;

interface Calls {
  since?: Date;
  fetched: string[];
}

function fakeProvider(mailbox: Record<string, RawEmail>, calls: Calls, fetchError?: Error): EmailProvider {
  return {
    async listHistoricalMessageIds() {
      return { messageIds: [] };
    },
    async fetchEmailById(id) {
      calls.fetched.push(id);
      if (fetchError) throw fetchError;
      return mailbox[id] ?? null;
    },
    async getCurrentCursor() {
      return "c1";
    },
    async listMessageIdsSince(since) {
      calls.since = since;
      return { messageIds: Object.keys(mailbox) };
    },
  };
}

const mail = (id: string): RawEmail => ({ ...mockEmails.globexConfirmation, providerMessageId: id });

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: "sync-test@example.com", name: "Sync Test" } });
  userId = user.id;
  const account = await prisma.connectedAccount.create({
    data: {
      userId,
      provider: "GMAIL",
      providerAccountId: "sync-test-account",
      emailAddress: "sync-test@example.com",
      accessTokenReference: "unused-sync-access",
      scopes: [],
      historyId: "c0",
    },
  });
  connectedAccountId = account.id;
});

describe("incremental sync", () => {
  it("lists since the last sync (with a day of overlap), ingests new mail, and clears any error", async () => {
    const lastSync = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    await prisma.connectedAccount.update({ where: { id: connectedAccountId }, data: { lastSyncError: "old failure" } });

    const calls: Calls = { fetched: [] };
    const result = await processIncrementalSync({
      userId,
      connectedAccountId,
      // (unique message id: ApplicationEvent ids are per mailbox, but keep this isolated from other files)
      provider: fakeProvider({ "sync-test-msg-1": mail("sync-test-msg-1") }, calls),
      sinceDate: lastSync,
    });

    expect(calls.since!.getTime()).toBe(lastSync.getTime() - 24 * 60 * 60 * 1000);
    expect(result.newEmails).toBe(1);
    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    expect(account.historyId).toBe("c1");
    expect(account.lastSyncedAt).not.toBeNull();
    expect(account.lastSyncError).toBeNull();
  });

  it("never downloads mail it has already processed", async () => {
    const calls: Calls = { fetched: [] };
    const result = await processIncrementalSync({
      userId,
      connectedAccountId,
      provider: fakeProvider({ "sync-test-msg-1": mail("sync-test-msg-1") }, calls),
    });
    expect(calls.fetched).toEqual([]);
    expect(result.newEmails).toBe(0);
  });

  it("never looks further back than the 60-day window", async () => {
    const calls: Calls = { fetched: [] };
    await processIncrementalSync({
      userId,
      connectedAccountId,
      provider: fakeProvider({}, calls),
      sinceDate: new Date("2020-01-01"),
    });
    const sixtyDaysAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
    expect(Math.abs(calls.since!.getTime() - sixtyDaysAgo)).toBeLessThan(60_000);
  });

  it("records a friendly failure, and does not advance the last-synced time, when Gmail errors", async () => {
    const before = (await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } })).lastSyncedAt;

    const calls: Calls = { fetched: [] };
    const quota = new Error("Quota exceeded for quota metric 'Total Query Cost' (project_number:898610235164)");
    await expect(
      processIncrementalSync({
        userId,
        connectedAccountId,
        provider: fakeProvider({ "sync-test-msg-2": mail("sync-test-msg-2") }, calls, quota),
      })
    ).rejects.toThrow("Quota exceeded");

    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    expect(account.lastSyncError).toMatch(/rate-limiting/i);
    expect(account.lastSyncError).not.toMatch(/reconnect/i);
    expect(account.lastSyncedAt).toEqual(before);
  });

  it("asks the user to reconnect when Google access has been revoked", async () => {
    const calls: Calls = { fetched: [] };
    await expect(
      processIncrementalSync({
        userId,
        connectedAccountId,
        provider: fakeProvider({ "sync-test-msg-3": mail("sync-test-msg-3") }, calls, new Error("invalid_grant")),
      })
    ).rejects.toThrow();
    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    expect(account.lastSyncError).toMatch(/reconnect/i);
  });
});

describe("follow-up reminders", () => {
  it("creates one reminder for a stale active application, and not another on the next run", async () => {
    const long = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const stale = await prisma.application.create({
      data: {
        userId,
        company: "Quietco",
        role: "Analyst",
        source: "OTHER",
        currentStatus: "INTERVIEW",
        appliedAt: long,
        createdAt: long,
        reviewState: "CONFIRMED",
      },
    });
    const fresh = await prisma.application.create({
      data: { userId, company: "Busyco", role: "Analyst", source: "OTHER", currentStatus: "APPLIED", appliedAt: new Date(), reviewState: "CONFIRMED" },
    });

    // (the application ingested by the sync test above may also be quiet by now, so don't pin the total)
    expect(await createFollowUpReminders(userId)).toBeGreaterThanOrEqual(1);
    expect(await createFollowUpReminders(userId)).toBe(0);

    const notes = await prisma.notification.findMany({ where: { userId, type: "FOLLOW_UP_DUE" } });
    const forStale = notes.filter((n) => n.applicationId === stale.id);
    expect(forStale).toHaveLength(1);
    expect(forStale[0].message).toMatch(/no update in \d+ days/i);
    expect(notes.some((n) => n.applicationId === fresh.id)).toBe(false);
  });
});
