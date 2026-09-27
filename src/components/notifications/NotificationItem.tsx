"use client";

import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { Notification } from "@/generated/prisma";

export function NotificationItem({
  notification,
  onRead,
}: {
  notification: Notification;
  onRead: (id: string) => void;
}) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (!notification.read) onRead(notification.id);
        if (notification.applicationId) {
          router.push(`/applications/${notification.applicationId}`);
        }
      }}
      className={clsx(
        "flex w-full flex-col gap-0.5 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50",
        !notification.read && "bg-blue-50/50"
      )}
    >
      <div className="flex items-center gap-2">
        {!notification.read && <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
        <span className="text-sm font-medium text-slate-900">{notification.title}</span>
      </div>
      <span className="text-sm text-slate-600">{notification.message}</span>
      <span className="text-xs text-slate-400">
        {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
      </span>
    </button>
  );
}
