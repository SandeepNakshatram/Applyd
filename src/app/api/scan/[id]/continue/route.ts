import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { continueInitialScan } from "@/lib/pipeline/scan";

/**
 * Processes one bounded chunk of a running initial scan. The scan page calls
 * this repeatedly (instead of a single long-running background task) so
 * progress survives serverless function duration limits — see scan.ts.
 */
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const scanJob = await prisma.scanJob.findUnique({
    where: { id },
    include: { connectedAccount: true },
  });
  if (!scanJob || scanJob.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (scanJob.stage === "COMPLETE" || scanJob.stage === "FAILED") {
    return NextResponse.json({ scanJob });
  }

  const provider = await getProviderForAccount(scanJob.connectedAccount);
  const updated = await continueInitialScan({
    scanJobId: scanJob.id,
    userId: session.user.id,
    connectedAccountId: scanJob.connectedAccountId,
    provider,
  });

  return NextResponse.json({ scanJob: updated });
}
