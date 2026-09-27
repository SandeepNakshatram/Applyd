import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { SummaryCards } from "@/components/dashboard/SummaryCards";
import { ApplicationList } from "@/components/dashboard/ApplicationList";
import { RecentActivity } from "@/components/dashboard/RecentActivity";
import { ReviewQueueBanner } from "@/components/dashboard/ReviewQueue";
import { AddApplicationButton } from "@/components/forms/AddApplicationButton";
import Link from "next/link";

const ACTIVE_STATUSES = ["APPLIED", "SCREENING", "ASSESSMENT", "INTERVIEW", "OFFER"] as const;

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const userId = session.user.id;

  const [total, active, interviews, followUpsDue, applications, pendingReview, notifications] =
    await Promise.all([
      prisma.application.count({ where: { userId, reviewState: { not: "IGNORED" } } }),
      prisma.application.count({
        where: { userId, reviewState: { not: "IGNORED" }, currentStatus: { in: [...ACTIVE_STATUSES] } },
      }),
      prisma.application.count({
        where: { userId, reviewState: { not: "IGNORED" }, currentStatus: "INTERVIEW" },
      }),
      prisma.application.count({
        where: {
          userId,
          reviewState: { not: "IGNORED" },
          nextActionDate: { lte: new Date() },
        },
      }),
      prisma.application.findMany({
        where: { userId, reviewState: { in: ["NONE", "CONFIRMED"] } },
        orderBy: { updatedAt: "desc" },
        take: 20,
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
    ]);

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-sm text-slate-500">
              Automatically discovered applications, kept up to date for you.
            </p>
          </div>
          <AddApplicationButton />
        </div>

        <SummaryCards total={total} active={active} interviews={interviews} followUpsDue={followUpsDue} />

        <ReviewQueueBanner applications={pendingReview} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">Applications</p>
              <Link href="/applications" className="text-xs font-medium text-blue-600">
                View all
              </Link>
            </div>
            <ApplicationList applications={applications} />
          </div>
          <RecentActivity notifications={notifications} />
        </div>
      </div>
    </AppShell>
  );
}
