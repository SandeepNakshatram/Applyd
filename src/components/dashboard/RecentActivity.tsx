import { formatDistanceToNow } from "date-fns";
import type { Notification } from "@/generated/prisma";
import { EmptyState } from "@/components/ui/EmptyState";

export function RecentActivity({ notifications }: { notifications: Notification[] }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">Recent activity</p>
      {notifications.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nothing yet" description="Activity will show up here as it happens." />
        </div>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {notifications.map((n) => (
            <li key={n.id} className="text-sm">
              <p className="text-slate-900">
                {n.title} — {n.message}
              </p>
              <p className="text-xs text-slate-400">
                {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
