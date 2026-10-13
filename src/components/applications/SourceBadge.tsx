import type { ApplicationSource } from "@/generated/prisma";
import { SOURCE_LABELS } from "@/lib/labels";

export function SourceBadge({ source }: { source: ApplicationSource }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      {SOURCE_LABELS[source]}
    </span>
  );
}
