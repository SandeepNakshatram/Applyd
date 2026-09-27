# Applyd (V1)

Applyd automatically discovers and tracks a user's job applications from their
inbox — the user never has to type in every application by hand. Connect
Gmail once; Applyd scans for application-related email, classifies it,
extracts structured data, resolves it against existing applications, and
keeps the dashboard and an in-app notification feed up to date as new email
arrives.

Manual entry ("+ Add Application") is a fallback, not the primary workflow.

## Stack

- **Next.js 16** (App Router, TypeScript, Tailwind) — frontend + API routes
- **Supabase Postgres** via **Prisma** — data model in [prisma/schema.prisma](prisma/schema.prisma)
- **Auth.js (NextAuth v5)** — Google OAuth, `gmail.readonly` scope only
- **Google Gemini** — email classification + structured extraction, with a
  deterministic rule-based fallback (see below) when no API key is configured
- **Vitest** + an embedded, throwaway Postgres instance — the automated test
  suite runs the real ingestion pipeline against a real database, no Docker
  or external service required

## Architecture

```
EMAIL (Gmail historical scan / incremental sync)
  -> RELEVANCE CLASSIFICATION      src/lib/ai/{deterministicClassifier,heuristicClient,geminiClient}.ts
  -> STRUCTURED EXTRACTION         (same files) + src/lib/ai/sourceDetector.ts
  -> APPLICATION RESOLUTION        src/lib/pipeline/resolver.ts   (deterministic matching + dedup)
  -> APPLICATION EVENT             Prisma `ApplicationEvent`
  -> STATUS UPDATE                 Prisma `Application.currentStatus`
  -> NOTIFICATION DECISION         src/lib/pipeline/notifications.ts
```

Everything above is orchestrated per-email by
[`src/lib/pipeline/ingest.ts`](src/lib/pipeline/ingest.ts) and per-scan by
[`src/lib/pipeline/scan.ts`](src/lib/pipeline/scan.ts). The same `ingestEmail`
function runs for the initial historical scan, incremental sync, and the test
suite — there's exactly one code path that turns an email into an
application/event/notification.

Email access is behind an `EmailProvider` interface
([`src/lib/email/EmailProvider.ts`](src/lib/email/EmailProvider.ts)) with
`GmailProvider` as the only V1 implementation, so a future direct
LinkedIn/Naukri integration (out of scope for V1) can be added without
touching the pipeline.

Deterministic logic is used wherever it's sufficient (OAuth, email-ID dedup,
sender/domain source detection, JOB_ALERT/IRRELEVANT pre-filtering); the AI
stage (Gemini, or the heuristic fallback) only handles genuinely ambiguous
classification/extraction, and its output for `source` is always overridden
by the deterministic detector — the model can never invent a source.

### Security (spec section 22)

- OAuth only; the app never sees or asks for a Gmail password.
- Raw OAuth tokens are never stored on `ConnectedAccount` (the model the rest
  of the app queries). They're AES-256-GCM encrypted
  ([`src/lib/crypto.ts`](src/lib/crypto.ts)) and stored in a separate
  `EmailAccountSecret` table, referenced only by id
  (`accessTokenReference` / `refreshTokenReference`).
- Tokens are only ever read server-side
  ([`src/lib/email/tokenStore.ts`](src/lib/email/tokenStore.ts),
  [`getProviderForAccount.ts`](src/lib/email/getProviderForAccount.ts)) and
  never logged.
- Gmail search is pre-filtered to job-related senders/keywords before
  fetching bodies — the app never downloads the whole mailbox — and only the
  minimum extracted fields are persisted, not raw email content.
- Disconnecting Gmail (`/settings`) revokes the token at Google (best-effort)
  and deletes the encrypted secret rows; the cron sync only ever processes
  `ACTIVE` connected accounts.

## Getting started

```bash
npm install
npx prisma generate
```

### 1. Environment variables

Copy `.env.example` to `.env` (already present with placeholders) and fill in:

| Variable | Where to get it |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Supabase → Project Settings → Database (pooled + direct connection strings) |
| `AUTH_SECRET` | `npx auth secret` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials (enable the **Gmail API**; add redirect URI `http://localhost:3000/api/auth/callback/google`) |
| `TOKEN_ENCRYPTION_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) — optional, see below |
| `CRON_SECRET` | any random string; sent as `Authorization: Bearer <value>` to `/api/cron/sync` |

**Without a real `GEMINI_API_KEY`**, the AI stage automatically falls back to
a deterministic, rule-based classifier/extractor
([`src/lib/ai/heuristicClient.ts`](src/lib/ai/heuristicClient.ts)) instead of
failing — this is also what the test suite uses, so the pipeline is fully
testable with zero external API keys.

### 2. Database

```bash
npx prisma migrate dev   # or: npx prisma db push, for a quick local sync
```

### 3. Run it

```bash
npm run dev
```

Open http://localhost:3000. With real Google OAuth credentials configured,
"Connect Gmail" runs the full flow: OAuth → real-progress scan page → populated
dashboard. Without them, the OAuth redirect will correctly reach Google and
fail there (expected) — see **Testing** below for how to exercise the full
pipeline without live credentials.

### 4. Automatic sync

New email is picked up by **server-side** incremental sync
(`GET /api/cron/sync`, protected by `CRON_SECRET`) — never client-side
polling. `vercel.json` wires this to Vercel Cron every 10 minutes; on any
other host, point an equivalent scheduler at the same endpoint.

## Testing

```bash
npm test
```

This spins up a throwaway Postgres instance (via `embedded-postgres`, no
Docker needed), pushes the Prisma schema to it, and runs:

- [`test/heuristic.test.ts`](test/heuristic.test.ts) — classification/extraction
  correctness for all 12 required mock emails (spec section 27): LinkedIn,
  Naukri, company-ATS, and referral confirmations; screening, assessment,
  interview, rejection, and offer emails; a job alert; an irrelevant email;
  and a duplicate resend.
- [`test/pipeline.test.ts`](test/pipeline.test.ts) — the full acceptance flow
  (spec section 28) against a real database: job alerts and irrelevant mail
  never create an application; the three Razorpay emails resolve into one
  `Application` with three `ApplicationEvent`s; a duplicate resend adds no
  4th event and no extra notification; an ATS identifier (not text matching)
  merges the Microsoft confirmation and assessment emails; a low-confidence
  email lands in the Review Queue instead of being guessed at; and
  notifications are created only for meaningful changes.

Other verification run for this build: `npx tsc --noEmit` (clean),
`npx eslint .` (clean), `npx next build` (succeeds).

## What's deliberately not built (spec section 26)

No LinkedIn/Naukri scraping or browser automation, no job recommendations,
no resume tooling, no outbound emails, no push notifications, no
subscriptions/payments — all in-app, read-only-Gmail, and notification-bell
only, per the V1 scope.

## Known V1 limitations

- Duplicate-event suppression is keyed on `(eventType, status)` per
  application, which correctly catches resent/duplicate notifications but
  would also treat a genuine *second* occurrence of the same stage (e.g. a
  second interview round) as a duplicate. Disambiguating that needs a signal
  beyond deterministic matching and was left out of V1 (see the comment in
  [`src/lib/pipeline/resolver.ts`](src/lib/pipeline/resolver.ts)).
- The initial historical scan runs inline in the request that starts it
  (via `after()`, so the triggering request itself returns immediately) —
  fine for V1/demo mailbox sizes, but a large mailbox would benefit from a
  real background job queue in a later version.
- Gmail push (Pub/Sub webhook) isn't wired up; incremental sync is
  server-side polling (`/api/cron/sync`) instead, per the spec's fallback
  option.
