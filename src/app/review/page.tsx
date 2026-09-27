import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ApplicationCard } from "@/components/applications/ApplicationCard";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ReviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/");

  const applications = await prisma.application.findMany({
    where: { userId: session.user.id, reviewState: "PENDING" },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Review Queue</h1>
          <p className="text-sm text-slate-500">
            Applications we weren&apos;t fully confident about. Confirm, edit, or ignore each one.
          </p>
        </div>

        {applications.length === 0 ? (
          <EmptyState
            title="Nothing needs review"
            description="Low-confidence detections will show up here for you to confirm."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {applications.map((app) => (
              <ApplicationCard key={app.id} application={app} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
