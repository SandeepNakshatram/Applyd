import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/crypto";

/**
 * Server-only bridge between ConnectedAccount (public-safe, frontend-visible
 * shape) and EmailAccountSecret (encrypted token storage). ConnectedAccount
 * never carries a raw token value, only the id of the secret row that holds
 * it ("accessTokenReference" / "refreshTokenReference" in the data model).
 */

export async function storeTokens(params: {
  accessToken: string;
  refreshToken: string | null;
}): Promise<{ accessTokenReference: string; refreshTokenReference: string | null }> {
  const accessSecret = await prisma.emailAccountSecret.create({
    data: encryptSecret(params.accessToken),
  });

  let refreshTokenReference: string | null = null;
  if (params.refreshToken) {
    const refreshSecret = await prisma.emailAccountSecret.create({
      data: encryptSecret(params.refreshToken),
    });
    refreshTokenReference = refreshSecret.id;
  }

  return { accessTokenReference: accessSecret.id, refreshTokenReference };
}

export async function updateAccessToken(
  accessTokenReference: string,
  newAccessToken: string
): Promise<void> {
  await prisma.emailAccountSecret.update({
    where: { id: accessTokenReference },
    data: encryptSecret(newAccessToken),
  });
}

export async function readToken(reference: string): Promise<string> {
  const secret = await prisma.emailAccountSecret.findUniqueOrThrow({
    where: { id: reference },
  });
  return decryptSecret(secret);
}

export async function deleteTokens(refs: {
  accessTokenReference: string;
  refreshTokenReference: string | null;
}): Promise<void> {
  await prisma.$transaction([
    prisma.emailAccountSecret.deleteMany({
      where: { id: { in: [refs.accessTokenReference, refs.refreshTokenReference].filter(Boolean) as string[] } },
    }),
  ]);
}
