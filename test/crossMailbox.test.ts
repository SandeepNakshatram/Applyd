import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { heuristicClient } from "@/lib/ai/heuristicClient";
import { ingestEmail } from "@/lib/pipeline/ingest";
import { mockEmails } from "./fixtures/mockEmails";

/**
 * Gmail message ids are unique only within one mailbox, so two users can
 * legitimately receive messages with the same id. De-duplication must be
 * per mailbox — a global unique on the event's email id made the second
 * user's ingest crash.
 */
async function newMailbox(tag: string) {
  const user = await prisma.user.create({ data: { email: `${tag}@example.com`, name: tag } });
  const account = await prisma.connectedAccount.create({
    data: {
      userId: user.id,
      provider: "GMAIL",
      providerAccountId: `${tag}-account`,
      emailAddress: `${tag}@example.com`,
      accessTokenReference: `unused-${tag}`,
      scopes: [],
    },
  });
  return { userId: user.id, connectedAccountId: account.id };
}

describe("the same Gmail message id in two different mailboxes", () => {
  it("is ingested independently for each user", async () => {
    const a = await newMailbox("cross-a");
    const b = await newMailbox("cross-b");
    const email = { ...mockEmails.globexConfirmation, providerMessageId: "shared-message-id" };

    const first = await ingestEmail({ ...a, email, aiClient: heuristicClient });
    const second = await ingestEmail({ ...b, email, aiClient: heuristicClient });

    expect(first.outcome).toBe("APPLICATION_CREATED");
    expect(second.outcome).toBe("APPLICATION_CREATED");
    expect(first.applicationId).not.toBe(second.applicationId);

    const events = await prisma.applicationEvent.findMany({ where: { emailId: "shared-message-id" } });
    expect(events.map((e) => e.connectedAccountId).sort()).toEqual(
      [a.connectedAccountId, b.connectedAccountId].sort()
    );
  });

  it("still never records the same email twice within one mailbox", async () => {
    const a = await newMailbox("cross-c");
    const email = { ...mockEmails.globexConfirmation, providerMessageId: "same-mailbox-id" };

    await ingestEmail({ ...a, email, aiClient: heuristicClient });
    const again = await ingestEmail({ ...a, email, aiClient: heuristicClient });

    expect(again.outcome).toBe("IGNORED_ALREADY_PROCESSED");
    expect(await prisma.applicationEvent.count({ where: { emailId: "same-mailbox-id" } })).toBe(1);
  });
});
