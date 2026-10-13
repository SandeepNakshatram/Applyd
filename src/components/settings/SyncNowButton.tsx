"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncNowButton() {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "syncing" | "done" | "failed" | "recent">("idle");

  async function handleClick() {
    setState("syncing");
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const body = (await res.json()) as { status?: string };
      setState(body.status === "synced" ? "done" : body.status === "skipped" ? "recent" : "failed");
    } catch {
      setState("failed");
    }
    router.refresh();
  }

  const message =
    state === "done"
      ? "Inbox checked."
      : state === "recent"
        ? "Checked a moment ago."
        : state === "failed"
          ? "Sync failed — see the error above."
          : null;

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={state === "syncing"}
        className="whitespace-nowrap rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {state === "syncing" ? "Checking…" : "Check email now"}
      </button>
      {message && <span className="text-xs text-slate-500">{message}</span>}
    </div>
  );
}
