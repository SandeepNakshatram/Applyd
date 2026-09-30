import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveConnectedAccount, getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { createScanJob, startInitialScan } from "@/lib/pipeline/scan";

/** A job stuck without progress this long is treated as dead and restartable
 * (e.g. the client tab was closed mid-scan, or a prior deploy's server-side
 * scan got killed by a function duration limit before chunking existed). */
const STALE_AFTER_MS = 3 * 60 * 1000;

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getActiveConnectedAccount(session.user.id);
  if (!account) {
    return NextResponse.json({ error: "No connected email account" }, { status: 400 });
  }

  const existingJob = await prisma.scanJob.findFirst({
    where: { connectedAccountId: account.id, type: "INITIAL" },
    orderBy: { startedAt: "desc" },
  });

  const isStale =
    existingJob &&
    existingJob.stage !== "COMPLETE" &&
    existingJob.stage !== "FAILED" &&
    Date.now() - existingJob.lastProgressAt.getTime() > STALE_AFTER_MS;

  if (existingJob && existingJob.stage !== "FAILED" && !isStale) {
    return NextResponse.json({ scanJobId: existingJob.id });
  }

  const scanJob = await createScanJob({
    userId: session.user.id,
    connectedAccountId: account.id,
    type: "INITIAL",
  });

  const provider = await getProviderForAccount(account);
  await startInitialScan({ scanJobId: scanJob.id, provider });

  return NextResponse.json({ scanJobId: scanJob.id });
}
