import "server-only";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { storeTokens, updateAccessToken } from "@/lib/email/tokenStore";

/**
 * Gmail read-only scope only — the minimum needed to read application-related
 * email (spec section 3/22). `access_type=offline` + `prompt=consent` ensure
 * we always get a refresh token so incremental sync can run without the user
 * being present. We intentionally do NOT use the Prisma adapter: its default
 * Account model stores raw provider tokens, and we want tokens to only ever
 * exist encrypted in EmailAccountSecret (see src/lib/crypto.ts).
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // Static token/userinfo endpoints skip Auth.js's callback-time OIDC
      // discovery for Google. That discovery fetch pulls in Google's
      // discovery doc, which advertises
      // `authorization_response_iss_parameter_supported: true`, but Google's
      // actual redirect never includes `iss` — auth4webapi then throws
      // `response parameter "iss" (issuer) missing` and sign-in fails
      // silently (no ConnectedAccount ever gets created). Skipping discovery
      // avoids depending on that (currently inconsistent) metadata at all.
      token: "https://oauth2.googleapis.com/token",
      userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
      authorization: {
        params: {
          scope: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/gmail.readonly",
          ].join(" "),
          access_type: "offline",
          prompt: "consent",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user.email || !account.access_token) {
        return false;
      }

      const dbUser = await prisma.user.upsert({
        where: { email: user.email },
        update: { name: user.name ?? undefined, image: user.image ?? undefined },
        create: { email: user.email, name: user.name ?? undefined, image: user.image ?? undefined },
      });

      // "Add an application manually" signs in with a reduced scope (no
      // gmail.readonly) — in that case we only create the User, never a
      // ConnectedAccount, so no scan is ever triggered for this session.
      const grantedScopes = (account.scope ?? "").split(" ");
      if (!grantedScopes.includes("https://www.googleapis.com/auth/gmail.readonly")) {
        return true;
      }

      const existing = await prisma.connectedAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "GMAIL",
            providerAccountId: account.providerAccountId,
          },
        },
      });

      if (existing) {
        await updateAccessToken(existing.accessTokenReference, account.access_token);
        await prisma.connectedAccount.update({
          where: { id: existing.id },
          data: { status: "ACTIVE", disconnectedAt: null },
        });
      } else {
        const { accessTokenReference, refreshTokenReference } = await storeTokens({
          accessToken: account.access_token,
          refreshToken: account.refresh_token ?? null,
        });

        await prisma.connectedAccount.create({
          data: {
            userId: dbUser.id,
            provider: "GMAIL",
            providerAccountId: account.providerAccountId,
            emailAddress: user.email,
            accessTokenReference,
            refreshTokenReference,
            scopes: (account.scope ?? "").split(" ").filter(Boolean),
          },
        });
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({ where: { email: user.email } });
        if (dbUser) token.userId = dbUser.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/",
  },
});
