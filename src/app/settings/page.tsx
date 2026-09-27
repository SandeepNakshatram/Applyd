import { redirect } from "next/navigation";
import { format } from "date-fns";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ConnectGmailButton } from "@/components/auth/ConnectButtons";
import { DisconnectAccountButton } from "@/components/settings/DisconnectAccountButton";

export default async function SettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const account = await prisma.connectedAccount.findFirst({
    where: { userId: session.user.id, status: "ACTIVE" },
  });

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-6">
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>

        <div className="rounded-xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-900">Connected email</p>
          {account ? (
            <div className="mt-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-900">{account.emailAddress}</p>
                <p className="text-xs text-slate-500">
                  {account.lastSyncedAt
                    ? `Last synced ${format(new Date(account.lastSyncedAt), "MMM d, yyyy p")}`
                    : "Sync in progress"}
                </p>
              </div>
              <DisconnectAccountButton />
            </div>
          ) : (
            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-slate-500">No inbox connected.</p>
              <ConnectGmailButton />
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          <p className="font-semibold text-slate-900">Privacy</p>
          <p className="mt-2">
            Applyd only requests read-only Gmail access, never your password. We store the minimum
            information needed to track your applications and never send tokens to the browser.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
