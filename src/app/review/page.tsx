import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { ReanalyzeAllButton } from "@/components/applications/ReanalyzeAllButton";
import { reviewReason } from "@/lib/reviewReason";

export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id, reviewState: "PENDING" },
    orderBy: { createdAt: "desc" },
    include: { events: { orderBy: { timestamp: "desc" }, take: 1 } },
  });

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-900">Review Queue</h1>
            <p className="text-sm text-slate-500">
              Applications we weren&apos;t fully confident about. Confirm, edit, or ignore each one — or
              re-analyze to have the original emails read again.
            </p>
          </div>
          <ReanalyzeAllButton
            applicationIds={applications.filter((a) => a.events[0]?.emailId).map((a) => a.id)}
          />
        </div>

        {applications.length === 0 ? (
          <EmptyState
            title="Nothing needs review"
            description="Low-confidence detections will show up here for you to confirm."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {applications.map((app) => (
              <ApplicationCard
                key={app.id}
                application={app}
                sourceEmailId={app.events[0]?.emailId ?? null}
                reason={reviewReason(app, app.events[0]?.extractedData)}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
