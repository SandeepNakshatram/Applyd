import "server-only";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { processIncrementalSync } from "@/lib/pipeline/scan";

/**
 * Server-side incremental sync, meant to be invoked by a scheduler (Vercel
 * Cron / any external cron hitting this with the shared secret) — never by
 * client-side polling (spec section 20).
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
    try {
      const provider = await getProviderForAccount(account);
      const result = await processIncrementalSync({
        userId: account.userId,
        connectedAccountId: account.id,
        provider,
        sinceCursor: account.historyId ?? "",
      });
      results.push({ connectedAccountId: account.id, ...result });
    } catch (err) {
      results.push({
        connectedAccountId: account.id,
        error: err instanceof Error ? err.message : "sync failed",
      });
    }
  }

  return NextResponse.json({ syncedAccounts: results.length, results });
}
