// Test-only stand-in for the `server-only` package. The real package throws
// unconditionally so a Client Component bundle fails to build if it (even
// transitively) imports server code — a guard Next.js's bundler understands
// via the "react-server" export condition. Vitest doesn't run through that
// bundler at all (it's exercising the actual server-side pipeline code in
// plain Node), so here it's a no-op.
export {};
