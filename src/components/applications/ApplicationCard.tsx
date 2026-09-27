"use client";

import { useRouter } from "next/navigation";
import { SourceBadge } from "./SourceBadge";
import { StatusBadge } from "./StatusBadge";
import type { Application } from "@/generated/prisma";

/** Review Queue card (spec section 15): company/role/source/status/confidence + confirm/edit/ignore. */
export function ApplicationCard({ application }: { application: Application }) {
  const router = useRouter();

  async function act(reviewAction: "confirm" | "ignore") {
    await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewAction }),
    });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">{application.company}</p>
          <p className="text-sm text-slate-500">{application.role}</p>
          <div className="mt-2 flex items-center gap-2">
            <SourceBadge source={application.source} />
            <StatusBadge status={application.currentStatus} />
          </div>
        </div>
        <span className="whitespace-nowrap text-xs font-medium text-slate-500">
          Confidence: {Math.round(application.confidence * 100)}%
        </span>
      </div>

      <div className="mt-3 flex gap-2">
        <button
          onClick={() => act("confirm")}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700"
        >
          Confirm
        </button>
        <button
          onClick={() => router.push(`/applications/${application.id}`)}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Edit
        </button>
        <button
          onClick={() => act("ignore")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Ignore
        </button>
      </div>
    </div>
  );
}
