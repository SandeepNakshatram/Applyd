import type { Application } from "@/generated/prisma";
import { ApplicationRow } from "@/components/applications/ApplicationRow";
import { EmptyState } from "@/components/ui/EmptyState";

export function ApplicationList({ applications }: { applications: Application[] }) {
  if (applications.length === 0) {
    return (
      <EmptyState
        title="No applications yet"
        description="Once we find applications in your inbox, or you add one manually, they'll show up here."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-12 gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        <div className="col-span-4">Company / Role</div>
        <div className="col-span-2">Source</div>
        <div className="col-span-2">Applied</div>
        <div className="col-span-2">Status</div>
        <div className="col-span-2">Next action</div>
      </div>
      {applications.map((app) => (
        <ApplicationRow key={app.id} application={app} />
      ))}
    </div>
  );
}
