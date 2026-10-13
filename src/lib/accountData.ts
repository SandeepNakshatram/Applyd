import "server-only";
import { google } from "googleapis";
import { prisma } from "@/lib/prisma";
import { deleteTokens, readToken } from "@/lib/email/tokenStore";

/**
 * Everything Applyd holds about a user, as plain JSON — never tokens or other
 * secrets. Timeline events carry the sender, subject and a short snippet of the
 * email each one was derived from (that is all we keep of an email).
 */
export async function exportUserData(userId: string) {
  const [user, applications, notifications, accounts] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true, name: true, createdAt: true },
    }),
    prisma.application.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      include: { events: { orderBy: { timestamp: "asc" } } },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: "asc" } }),
    prisma.connectedAccount.findMany({
      where: { userId },
      select: {
        provider: true,
        emailAddress: true,
        status: true,
        createdAt: true,
        lastSyncedAt: true,
        disconnectedAt: true,
      },
    }),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    user,
    connectedAccounts: accounts,
    applications,
    notifications,
  };
}

/** Best-effort token revocation at Google; local deletion never depends on it. */
async function revokeAtGoogle(accessTokenReference: string): Promise<void> {
  try {
    const accessToken = await readToken(accessTokenReference);
    const client = new google.auth.OAuth2();
    client.setCredentials({ access_token: accessToken });
    await client.revokeToken(accessToken);
  } catch {
    // Token already gone or expired — nothing to revoke.
  }
}

/** Disconnects one mailbox: revoke at Google, delete stored tokens, stop syncing. Keeps applications. */
export async function disconnectAccount(account: {
  id: string;
  accessTokenReference: string;
  refreshTokenReference: string | null;
}): Promise<void> {
  await revokeAtGoogle(account.accessTokenReference);
  await deleteTokens({
    accessTokenReference: account.accessTokenReference,
    refreshTokenReference: account.refreshTokenReference,
  });
  await prisma.connectedAccount.update({
    where: { id: account.id },
    data: { status: "DISCONNECTED", disconnectedAt: new Date(), lastSyncError: null },
  });
}

/** Revokes and wipes tokens, then deletes the user and (by cascade) all of their data. */
export async function deleteUserAccount(userId: string): Promise<void> {
  const accounts = await prisma.connectedAccount.findMany({ where: { userId } });
  for (const account of accounts) {
    if (account.status === "ACTIVE") await revokeAtGoogle(account.accessTokenReference);
    await deleteTokens({
      accessTokenReference: account.accessTokenReference,
      refreshTokenReference: account.refreshTokenReference,
    });
  }
  await prisma.user.delete({ where: { id: userId } });
}
