import Link from "next/link";
import { format } from "date-fns";
import type { Application } from "@/generated/prisma";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";
import { displayCompany, displayRole } from "@/lib/placeholders";
import { daysSinceActivity, isStale } from "@/lib/followUps";

export type ApplicationRowData = Application & { events?: { timestamp: Date }[] };

export function ApplicationRow({ application }: { application: ApplicationRowData }) {
  const followUp = { ...application, lastEventAt: application.events?.[0]?.timestamp ?? null };
  const stale = isStale(followUp);
  const company = displayCompany(application.company);
  const role = displayRole(application.role);
  const nextAction = application.nextAction ?? "—";

  return (
    <Link
      href={`/applications/${application.id}`}
      className="grid grid-cols-12 items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 hover:bg-slate-50"
    >
      <div className="col-span-4 min-w-0">
        <p className="truncate font-medium text-slate-900" title={company}>
          {company}
        </p>
        <p className="truncate text-slate-500" title={role}>
          {role}
        </p>
      </div>
      <div className="col-span-2">
        <SourceBadge source={application.source} />
      </div>
      <div
        className="col-span-2 text-slate-500"
        title={application.appliedAtEstimated ? "Estimated from the earliest email we found" : undefined}
      >
        {application.appliedAt
          ? `${application.appliedAtEstimated ? "~" : ""}${format(new Date(application.appliedAt), "MMM d, yyyy")}`
          : "—"}
      </div>
      <div className="col-span-2 flex flex-col items-start gap-1">
        <StatusBadge status={application.currentStatus} />
        {stale && (
          <span className="whitespace-nowrap text-xs font-medium text-amber-700">
            No update in {daysSinceActivity(followUp)} days
          </span>
        )}
      </div>
      <div className="col-span-2 truncate text-slate-500" title={nextAction}>
        {nextAction}
      </div>
    </Link>
  );
}
