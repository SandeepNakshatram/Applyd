import { redirect } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectGmailButton } from "@/components/auth/ConnectButtons";
import { DisconnectAccountButton } from "@/components/settings/DisconnectAccountButton";
import { RescanButton } from "@/components/settings/RescanButton";
import { SyncNowButton } from "@/components/settings/SyncNowButton";
import { DeleteAccountButton } from "@/components/settings/DeleteAccountButton";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex max-w-3xl flex-col gap-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900">Connected email</p>
          {account ? (
            <div className="mt-3 flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-900">{account.emailAddress}</p>
                  <p className="text-xs text-slate-500">
                    {account.lastSyncedAt
                      ? `Last checked ${formatDistanceToNow(account.lastSyncedAt, { addSuffix: true })} (${format(account.lastSyncedAt, "MMM d, yyyy p")})`
                      : "First scan in progress"}
                  </p>
                  {account.lastSyncError && (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      Last sync failed: {account.lastSyncError}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <RescanButton />
                  <DisconnectAccountButton />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <p className="max-w-md text-xs text-slate-500">
                  Your inbox is checked automatically once a day, and again whenever you open Applyd
                  (at most every 15 minutes). You can also check it right now.
                </p>
                <SyncNowButton />
              </div>
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-slate-500">No inbox connected.</p>
              <ConnectGmailButton />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p className="font-semibold text-slate-900">Privacy &amp; your data</p>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>
              <span className="font-medium text-slate-900">Access:</span> read-only Gmail access via Google
              sign-in. Applyd never sees your password and can&apos;t send, delete or change email. Access
              tokens are stored encrypted and never sent to your browser.
            </li>
            <li>
              <span className="font-medium text-slate-900">What we read:</span> only mail that looks
              job-related (from job boards and applicant-tracking systems, or with subjects like
              &ldquo;application&rdquo; or &ldquo;interview&rdquo;), from the last 60 days.
            </li>
            <li>
              <span className="font-medium text-slate-900">What we store:</span> the details we extract
              (company, role, status, dates), plus for each email the sender, subject and a short
              snippet (about 160 characters) so you can see where each update came from. Full email
              bodies are not stored.
            </li>
            <li>
              <span className="font-medium text-slate-900">AI processing:</span> the text of each
              job-related email (up to about 4,000 characters) is sent to Google&apos;s Gemini API to
              classify it and read out the details. Job-alert and non-job mail is filtered out locally
              first where possible. Depending on the Gemini API plan in use, Google may retain or use
              API content under its own terms.
            </li>
            <li>
              <span className="font-medium text-slate-900">Disconnecting</span> revokes Gmail access
              and deletes the stored tokens; your applications stay.{" "}
              <span className="font-medium text-slate-900">Deleting your account</span> removes
              everything.
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900">Your data</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-md text-sm text-slate-500">
              Download everything Applyd holds about you (applications, timelines, notifications) as a
              JSON file.
            </p>
            <a
              href="/api/account/export"
              className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Export my data
            </a>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <p className="max-w-md text-sm text-slate-500">
              Permanently delete your account, all applications and timelines, and revoke Gmail access.
            </p>
            <DeleteAccountButton />
          </div>
        </section>
      </div>
    </AppShell>
  );
}
