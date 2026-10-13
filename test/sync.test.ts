import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import { processIncrementalSync } from "@/lib/pipeline/scan";
import { createFollowUpReminders } from "@/lib/pipeline/sync";
import { mockEmails } from "./fixtures/mockEmails";

let userId: string;
let connectedAccountId: string;

function providerReturning(emails: unknown[], seen?: { sinceDate?: Date }): EmailProvider {
  return {
    async listHistoricalMessageIds() {
      return { messageIds: [] };
    },
    async fetchEmailById() {
      return null;
    },
    async getCurrentCursor() {
      return "c0";
    },
    async syncIncremental(_cursor, sinceDate) {
      if (seen) seen.sinceDate = sinceDate;
      return { emails: emails as never[], cursor: "c1" };
    },
  };
}

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
  it("passes the last-sync date to the provider, advances the cursor and clears any error", async () => {
    const lastSync = new Date("2026-10-01T00:00:00Z");
    await prisma.connectedAccount.update({ where: { id: connectedAccountId }, data: { lastSyncError: "old failure" } });

    const seen: { sinceDate?: Date } = {};
    const result = await processIncrementalSync({
      userId,
      connectedAccountId,
      // (unique message id: ApplicationEvent.emailId is unique across the whole test database)
      provider: providerReturning([{ ...mockEmails.globexConfirmation, providerMessageId: "sync-test-msg-1" }], seen),
      sinceCursor: "c0",
      sinceDate: lastSync,
    });

    expect(seen.sinceDate).toEqual(lastSync);
    expect(result.newEmails).toBe(1);
    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    expect(account.historyId).toBe("c1");
    expect(account.lastSyncedAt).not.toBeNull();
    expect(account.lastSyncError).toBeNull();
  });

  it("records the failure and keeps the cursor when the provider throws", async () => {
    const failing: EmailProvider = {
      ...providerReturning([]),
      async syncIncremental() {
        throw new Error("invalid_grant");
      },
    };
    await expect(
      processIncrementalSync({ userId, connectedAccountId, provider: failing, sinceCursor: "c1" })
    ).rejects.toThrow("invalid_grant");

    const account = await prisma.connectedAccount.findUniqueOrThrow({ where: { id: connectedAccountId } });
    expect(account.historyId).toBe("c1");
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
