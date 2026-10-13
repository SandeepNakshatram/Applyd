import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncAccount, createFollowUpReminders } from "@/lib/pipeline/sync";

export const maxDuration = 60;

/** "Sync now": a user-triggered incremental sync (rate-limited to once per minute). */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  if (!account) {
    return NextResponse.json({ error: "No connected account" }, { status: 400 });
  }

  const outcome = await syncAccount(account, { minIntervalMs: 60 * 1000 });
  if (outcome.status === "synced") await createFollowUpReminders(session.user.id);

  return NextResponse.json(outcome);
}
