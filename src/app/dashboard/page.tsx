import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { ApplicationList } from "@/components/dashboard/ApplicationList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ReviewQueueBanner } from "@/components/dashboard/ReviewQueue";
import { AddApplicationButton } from "@/components/forms/AddApplicationButton";
import { SyncStatus } from "@/components/dashboard/SyncStatus";
import { isFollowUpDue } from "@/lib/followUps";
import type { ReviewState } from "@/generated/prisma";

// Stats only count records the user can see in the list (confirmed or
// auto-accepted) — pending ones are reported separately as "needs review".
const COUNTED: { in: ReviewState[] } = { in: ["NONE", "CONFIRMED"] };
const OPEN_STATUSES = ["APPLIED", "SCREENING", "ASSESSMENT", "INTERVIEW", "OFFER"] as const;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const userId = session.user.id;

  const [counted, pendingReview, notifications, account] = await Promise.all([
    prisma.application.findMany({
      where: { userId, reviewState: COUNTED },
      orderBy: { updatedAt: "desc" },
      include: { events: { orderBy: { timestamp: "desc" }, take: 1, select: { timestamp: true } } },
    }),
    prisma.application.findMany({
      where: { userId, reviewState: "PENDING" },
      orderBy: { createdAt: "desc" },
    }),
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    prisma.connectedAccount.findFirst({
      where: { userId, status: "ACTIVE" },
      select: { lastSyncedAt: true, lastSyncError: true },
    }),
  ]);

  const now = new Date();
  const total = counted.length;
  const active = counted.filter((a) => (OPEN_STATUSES as readonly string[]).includes(a.currentStatus)).length;
  const interviews = counted.filter((a) => a.currentStatus === "INTERVIEW").length;
  const followUpsDue = counted.filter((a) =>
    isFollowUpDue({ ...a, lastEventAt: a.events[0]?.timestamp ?? null }, now)
  ).length;

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">
              Automatically discovered applications, kept up to date for you.
            </p>
            {account && (
              <SyncStatus lastSyncedAt={account.lastSyncedAt} lastSyncError={account.lastSyncError} />
            )}
          </div>
          <AddApplicationButton />
        </div>

        <SummaryCards
          total={total}
          active={active}
          interviews={interviews}
          followUpsDue={followUpsDue}
          needsReview={pendingReview.length}
        />

        <ReviewQueueBanner applications={pendingReview} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Applications</p>
              <Link href="/applications" className="text-xs font-medium text-blue-600">
                View all
              </Link>
            </div>
            <ApplicationList applications={counted.slice(0, 20)} />
          </div>
          <RecentActivity notifications={notifications} />
        </div>
      </div>
    </AppShell>
  );
}
