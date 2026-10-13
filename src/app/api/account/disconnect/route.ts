import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { disconnectAccount } from "@/lib/accountData";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });
  if (!account) {
    return NextResponse.json({ error: "No connected account" }, { status: 400 });
  }

  await disconnectAccount(account);

  return NextResponse.json({ ok: true });
}
