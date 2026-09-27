import Link from "next/link";
import { format } from "date-fns";
import type { Application } from "@/generated/prisma";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";

export function ApplicationRow({ application }: { application: Application }) {
  return (
    <Link
      href={`/applications/${application.id}`}
      className="grid grid-cols-12 items-center gap-3 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0 hover:bg-slate-50"
    >
      <div className="col-span-4 min-w-0">
        <p className="truncate font-medium text-slate-900">{application.company}</p>
        <p className="truncate text-slate-500">{application.role}</p>
      </div>
      <div className="col-span-2">
        <SourceBadge source={application.source} />
      </div>
      <div className="col-span-2 text-slate-500">
        {application.appliedAt ? format(new Date(application.appliedAt), "MMM d, yyyy") : "—"}
      </div>
      <div className="col-span-2">
        <StatusBadge status={application.currentStatus} />
      </div>
      <div className="col-span-2 truncate text-slate-500">
        {application.nextAction ?? "—"}
      </div>
    </Link>
  );
}
