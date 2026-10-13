import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncAccount, createFollowUpReminders } from "@/lib/pipeline/sync";

export const maxDuration = 300;

/**
 * Server-side incremental sync, meant to be invoked by a scheduler (Vercel
 * Cron / any external cron hitting this with the shared secret) — never by
 * client-side polling (spec section 20). Also raises follow-up reminders for
 * applications that are due or have gone quiet.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accounts = await prisma.connectedAccount.findMany({
    where: { status: "ACTIVE" },
  });

  const results = [];
  for (const account of accounts) {
    const outcome = await syncAccount(account, { force: true });
    results.push({ connectedAccountId: account.id, ...outcome });
  }

  let followUpsCreated = 0;
  try {
    followUpsCreated = await createFollowUpReminders();
  } catch (err) {
    console.error("[cron] follow-up reminders failed:", err instanceof Error ? err.message : err);
  }

  return NextResponse.json({ syncedAccounts: results.length, followUpsCreated, results });
}
