"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import { NotificationBell } from "@/components/notifications/NotificationBell";

export function TopBar({ userName, userImage }: { userName?: string | null; userImage?: string | null }) {
  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <div className="text-sm text-slate-500 md:hidden font-semibold text-slate-900">Applyd</div>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <NotificationBell />
        <div className="flex items-center gap-2">
          {userImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={userImage} alt="" className="h-8 w-8 rounded-full" />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
              {userName?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <span className="hidden text-sm font-medium text-slate-700 sm:inline">{userName}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/" })}
          aria-label="Sign out"
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
