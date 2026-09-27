import "server-only";
import type { ConnectedAccount } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { readToken, updateAccessToken } from "./tokenStore";
import { GmailProvider } from "./GmailProvider";
import type { EmailProvider } from "./EmailProvider";

export async function getProviderForAccount(account: ConnectedAccount): Promise<EmailProvider> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not configured.");
  }

  const accessToken = await readToken(account.accessTokenReference);
  const refreshToken = account.refreshTokenReference
    ? await readToken(account.refreshTokenReference)
    : null;

  return new GmailProvider({
    accessToken,
    refreshToken,
    clientId,
    clientSecret,
    onAccessTokenRefreshed: async (newAccessToken) => {
      await updateAccessToken(account.accessTokenReference, newAccessToken);
    },
  });
}

export async function getActiveConnectedAccount(userId: string) {
  return prisma.connectedAccount.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
}
