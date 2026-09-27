import { NextResponse } from "next/server";
import { after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActiveConnectedAccount, getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { createScanJob, processInitialScan } from "@/lib/pipeline/scan";

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
  if (existingJob && existingJob.stage !== "FAILED") {
    return NextResponse.json({ scanJobId: existingJob.id });
  }

  const scanJob = await createScanJob({
    userId: session.user.id,
    connectedAccountId: account.id,
    type: "INITIAL",
  });

  const provider = await getProviderForAccount(account);

  after(() =>
    processInitialScan({
      scanJobId: scanJob.id,
      userId: session.user.id,
      connectedAccountId: account.id,
      provider,
    })
  );

  return NextResponse.json({ scanJobId: scanJob.id });
}
