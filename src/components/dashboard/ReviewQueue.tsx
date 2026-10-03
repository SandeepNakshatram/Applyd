import Link from "next/link";
import type { Application } from "@/generated/prisma";
import { SourceBadge } from "@/components/applications/SourceBadge";
import { describeApplication } from "@/lib/placeholders";

export function ReviewQueueBanner({ applications }: { applications: Application[] }) {
  if (applications.length === 0) return null;

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-amber-900">
          {applications.length} application{applications.length === 1 ? "" : "s"} need your attention
        </p>
        <Link href="/review" className="text-xs font-medium text-amber-900 underline">
          Review now
        </Link>
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {applications.slice(0, 3).map((app) => (
          <li key={app.id} className="flex items-center justify-between text-sm text-amber-900">
            <span className="truncate">
              {describeApplication(app.company, app.role)}
            </span>
            <SourceBadge source={app.source} />
          </li>
        ))}
      </ul>
    </div>
  );
}
