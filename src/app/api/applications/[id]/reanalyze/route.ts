import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAIClient, isModelConfigured } from "@/lib/ai";
import { getActiveConnectedAccount, getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { reanalyzeApplication } from "@/lib/pipeline/reanalyze";

/** One Gmail fetch + one model call per source email. */
export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await getActiveConnectedAccount(session.user.id);
  if (!account) {
    return NextResponse.json(
      { result: { status: "UNAVAILABLE", reason: "Connect your Gmail first — re-analysis reads the original email." } },
      { status: 400 }
    );
  }

  const { id } = await params;
  const provider = await getProviderForAccount(account);
  const result = await reanalyzeApplication({
    userId: session.user.id,
    connectedAccountId: account.id,
    applicationId: id,
    provider,
    aiClient: getAIClient(),
    requireModel: isModelConfigured(),
  });

  return NextResponse.json({ result });
}
