"use client";

import type { Notification } from "@/generated/prisma";
import { NotificationItem } from "./NotificationItem";
import { EmptyState } from "@/components/ui/EmptyState";

export function NotificationDropdown({
  notifications,
  onRead,
  onReadAll,
}: {
  notifications: Notification[];
  onRead: (id: string) => void;
  onReadAll: () => void;
}) {
  return (
    <div className="absolute right-0 top-full z-40 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <span className="text-sm font-semibold text-slate-900">Notifications</span>
        <button
          onClick={onReadAll}
          className="text-xs font-medium text-blue-600 hover:text-blue-700"
        >
          Mark all as read
        </button>
      </div>
      <div className="max-h-96 overflow-y-auto">
        {notifications.length === 0 ? (
          <div className="p-2">
            <EmptyState title="No notifications yet" description="We'll let you know when something changes." />
          </div>
        ) : (
          notifications.map((n) => (
            <NotificationItem key={n.id} notification={n} onRead={onRead} />
          ))
        )}
      </div>
    </div>
  );
}
