import { auth } from "@/auth";
import { NextResponse } from "next/server";

// Auth.js callbacks in src/auth.ts touch Prisma (Node APIs, native query
// engine binary). Proxy defaults to the Node.js runtime as of Next.js 16,
// so no explicit runtime config is needed (setting one here would error).
const PROTECTED_PREFIXES = ["/dashboard", "/applications", "/review", "/settings", "/scan"];

export default auth((req) => {
  const isProtected = PROTECTED_PREFIXES.some((p) => req.nextUrl.pathname.startsWith(p));
  if (isProtected && !req.auth) {
    const signInUrl = new URL("/", req.nextUrl.origin);
    return NextResponse.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/dashboard/:path*", "/applications/:path*", "/review/:path*", "/settings/:path*", "/scan/:path*"],
};
