import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { heuristicClient } from "@/lib/ai/heuristicClient";
import { ingestEmail } from "@/lib/pipeline/ingest";
import { mockEmails } from "./fixtures/mockEmails";

/**
 * Found while testing the live app: a newer "your application is incomplete"
 * reminder dragged an Infosys application from Interview back to Applied.
 */
describe("a generic reminder never moves an application backwards", () => {
  it("keeps Interview when a later 'complete your application' email arrives", async () => {
    const user = await prisma.user.create({ data: { email: "stage-order@example.com", name: "Stage Order" } });
    const account = await prisma.connectedAccount.create({
      data: {
        userId: user.id,
        provider: "GMAIL",
        providerAccountId: "stage-order-account",
        emailAddress: "stage-order@example.com",
        accessTokenReference: "unused-stage-order",
        scopes: [],
      },
    });
    const run = (email: Parameters<typeof ingestEmail>[0]["email"]) =>
      ingestEmail({ userId: user.id, connectedAccountId: account.id, email, aiClient: heuristicClient });

    await run({
      ...mockEmails.infosysIncompleteApplication,
      providerMessageId: "stage-1",
      body: "Hi Alex, Thank you for applying for the role of Technology Analyst. We have received your application and will review it. Best regards, Talent Acquisition Infosys Limited",
    });
    await run({ ...mockEmails.infosysInterviewInvite, providerMessageId: "stage-2" });

    const reminder = await run({
      ...mockEmails.infosysIncompleteApplication,
      providerMessageId: "stage-3",
      receivedAt: new Date("2026-10-05T08:00:00Z"),
    });

    expect(reminder.outcome).toBe("EVENT_ADDED_NO_NOTIFICATION");
    const apps = await prisma.application.findMany({
      where: { userId: user.id },
      include: { events: true },
    });
    expect(apps).toHaveLength(1);
    expect(apps[0].currentStatus).toBe("INTERVIEW");
    expect(apps[0].nextAction).not.toMatch(/complete your application/i);
    // ...but it is still on the timeline.
    expect(apps[0].events).toHaveLength(3);
  });
});
