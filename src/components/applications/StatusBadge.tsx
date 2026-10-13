import type { ApplicationStatus } from "@/generated/prisma";
import clsx from "clsx";
import { STATUS_LABELS } from "@/lib/labels";

const STATUS_STYLES: Record<ApplicationStatus, string> = {
  APPLIED: "bg-slate-100 text-slate-700 ring-slate-300",
  SCREENING: "bg-blue-50 text-blue-700 ring-blue-300",
  ASSESSMENT: "bg-indigo-50 text-indigo-700 ring-indigo-300",
  INTERVIEW: "bg-amber-50 text-amber-800 ring-amber-300",
  OFFER: "bg-emerald-50 text-emerald-700 ring-emerald-300",
  REJECTED: "bg-red-50 text-red-700 ring-red-300",
  WITHDRAWN: "bg-neutral-100 text-neutral-500 ring-neutral-300",
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        STATUS_STYLES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
