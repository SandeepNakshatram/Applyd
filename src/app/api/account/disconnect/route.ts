import "server-only";
import { NextResponse } from "next/server";
import { google } from "googleapis";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { deleteTokens, readToken } from "@/lib/email/tokenStore";

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

  // Best-effort revoke at Google; disconnect proceeds even if this fails
  // (e.g. token already expired), since the local stop-sync guarantee below
  // doesn't depend on it.
  try {
    const accessToken = await readToken(account.accessTokenReference);
    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    await oauth2Client.revokeToken(accessToken);
  } catch {
    // ignore — see comment above
  }

  await deleteTokens({
    accessTokenReference: account.accessTokenReference,
    refreshTokenReference: account.refreshTokenReference,
  });

  await prisma.connectedAccount.update({
    where: { id: account.id },
    data: { status: "DISCONNECTED", disconnectedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
