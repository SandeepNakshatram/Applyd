import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { heuristicClient } from "@/lib/ai/heuristicClient";
import type { EmailProvider } from "@/lib/email/EmailProvider";
import { reanalyzeApplication } from "@/lib/pipeline/reanalyze";
import type { RawEmail } from "@/types/pipeline";
import { mockEmails } from "./fixtures/mockEmails";

/**
 * Re-analysis: re-reading an application's source email(s) with the current
 * pipeline and replacing the application with the result — the way an item
 * that was extracted badly (or never should have been an application) gets
 * fixed without touching the database by hand.
 */

let userId: string;
let connectedAccountId: string;
let mailbox: Record<string, RawEmail | null> = {};

const provider: EmailProvider = {
  async listHistoricalMessageIds() {
    return { messageIds: Object.keys(mailbox) };
  },
  async fetchEmailById(id) {
    return mailbox[id] ?? null;
  },
  async getCurrentCursor() {
    return "cursor";
  },
  async syncIncremental() {
    return { emails: [], cursor: "cursor" };
  },
};

/** An application that was saved with bad data, plus the event/marker a scan would have left. */
async function seedBadApplication(emailId: string, data: { company: string; role: string; confidence: number; reviewState: "NONE" | "PENDING" }) {
  const application = await prisma.application.create({
    data: { userId, source: "OTHER", currentStatus: "APPLIED", ...data },
  });
  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      eventType: "APPLICATION_CONFIRMATION",
      status: "APPLIED",
      timestamp: new Date("2026-09-10T08:00:00Z"),
      source: "OTHER",
      emailId,
      confidence: data.confidence,
    },
  });
  await prisma.processedEmail.create({
    data: { connectedAccountId, providerMessageId: emailId, eventType: "APPLICATION_CONFIRMATION" },
  });
  await prisma.notification.create({
    data: { userId, applicationId: application.id, type: "NEW_APPLICATION", title: "New application found", message: data.company },
  });
  return application;
}

function run(applicationId: string, requireModel = false) {
  return reanalyzeApplication({
    userId,
    connectedAccountId,
    applicationId,
    provider,
    aiClient: heuristicClient,
    requireModel,
  });
}

beforeAll(async () => {
  const user = await prisma.user.create({ data: { email: "reanalyze-test@example.com", name: "Reanalyze Test" } });
  userId = user.id;
  const account = await prisma.connectedAccount.create({
    data: {
      userId,
      provider: "GMAIL",
      providerAccountId: "reanalyze-test-account",
      emailAddress: "reanalyze-test@example.com",
      accessTokenReference: "unused-reanalyze-access",
      scopes: [],
    },
  });
  connectedAccountId = account.id;
});

describe("re-analyzing a badly extracted application", () => {
  it("repairs the 'the earliest' / sentence-as-role garbage in place, without notifying", async () => {
    const emailId = "reanalyze-infosys-1";
    mailbox = { [emailId]: { ...mockEmails.infosysIncompleteApplication, providerMessageId: emailId } };
    const bad = await seedBadApplication(emailId, {
      company: "the earliest",
      role: "the role of Technology Analyst. As per our records, your application is incomplete. Please log in to Infosys Careers",
      confidence: 0.9,
      reviewState: "NONE",
    });
    const notificationsBefore = await prisma.notification.count({ where: { userId } });

    const result = await run(bad.id);
    expect(result.status).toBe("UPDATED");

    expect(await prisma.application.findUnique({ where: { id: bad.id } })).toBeNull();
    const fixed = await prisma.application.findMany({ where: { userId, company: "Infosys" } });
    expect(fixed).toHaveLength(1);
    expect(fixed[0].role).toBe("Technology Analyst");
    expect(fixed[0].reviewState).toBe("NONE");

    // The old application's notification went with it; re-analysis creates none of its own.
    expect(await prisma.notification.count({ where: { userId } })).toBe(notificationsBefore - 1);
    expect(await prisma.processedEmail.count({ where: { connectedAccountId, providerMessageId: emailId } })).toBe(1);
  });

  it("removes an application that was really a job-board advertisement", async () => {
    const emailId = "reanalyze-foundit-1";
    mailbox = { [emailId]: { ...mockEmails.founditJobAd, providerMessageId: emailId } };
    const bad = await seedBadApplication(emailId, {
      company: "Unknown company",
      role: "Unknown role",
      confidence: 0.35,
      reviewState: "PENDING",
    });

    const result = await run(bad.id);
    expect(result.status).toBe("REMOVED");
    expect(await prisma.application.findUnique({ where: { id: bad.id } })).toBeNull();

    const marker = await prisma.processedEmail.findUniqueOrThrow({
      where: { connectedAccountId_providerMessageId: { connectedAccountId, providerMessageId: emailId } },
    });
    expect(marker.eventType).toBe("JOB_ALERT");
  });

  it("removes an application that was really a school admissions mail", async () => {
    const emailId = "reanalyze-admissions-1";
    mailbox = { [emailId]: { ...mockEmails.mesaAdmissions, providerMessageId: emailId } };
    const bad = await seedBadApplication(emailId, {
      company: "Unknown company",
      role: "Unknown role",
      confidence: 0.35,
      reviewState: "PENDING",
    });

    const result = await run(bad.id);
    expect(result.status).toBe("REMOVED");
    expect(await prisma.application.findUnique({ where: { id: bad.id } })).toBeNull();
  });
});

describe("re-analysis never makes things worse", () => {
  it("changes nothing when a real model is required but only the heuristic fallback answered", async () => {
    const emailId = "reanalyze-infosys-2";
    mailbox = { [emailId]: { ...mockEmails.infosysIncompleteApplication, providerMessageId: emailId } };
    const bad = await seedBadApplication(emailId, {
      company: "Unknown company",
      role: "Unknown role",
      confidence: 0.35,
      reviewState: "PENDING",
    });

    const result = await run(bad.id, true);
    expect(result.status).toBe("AI_UNAVAILABLE");

    const untouched = await prisma.application.findUniqueOrThrow({ where: { id: bad.id } });
    expect(untouched.company).toBe("Unknown company");
    expect(await prisma.applicationEvent.count({ where: { applicationId: bad.id } })).toBe(1);
    expect(await prisma.processedEmail.count({ where: { connectedAccountId, providerMessageId: emailId } })).toBe(1);
  });

  it("changes nothing when the source email is no longer in Gmail", async () => {
    const emailId = "reanalyze-gone-1";
    mailbox = { [emailId]: null };
    const bad = await seedBadApplication(emailId, {
      company: "Unknown company",
      role: "Unknown role",
      confidence: 0.35,
      reviewState: "PENDING",
    });

    const result = await run(bad.id);
    expect(result.status).toBe("UNAVAILABLE");
    expect(await prisma.application.findUnique({ where: { id: bad.id } })).not.toBeNull();
  });

  it("explains that manually added applications have no source email", async () => {
    const manual = await prisma.application.create({
      data: { userId, company: "Manual Co", role: "Engineer", source: "OTHER", isManual: true },
    });
    const result = await run(manual.id);
    expect(result.status).toBe("UNAVAILABLE");
    expect(await prisma.application.findUnique({ where: { id: manual.id } })).not.toBeNull();
  });

  it("won't touch another user's application", async () => {
    const other = await prisma.user.create({ data: { email: "reanalyze-other@example.com" } });
    const theirs = await prisma.application.create({
      data: { userId: other.id, company: "Theirs", role: "Role", source: "OTHER" },
    });
    const result = await run(theirs.id);
    expect(result.status).toBe("UNAVAILABLE");
    expect(await prisma.application.findUnique({ where: { id: theirs.id } })).not.toBeNull();
  });
});
