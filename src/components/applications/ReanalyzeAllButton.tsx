"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

interface Outcome {
  status: "UPDATED" | "REMOVED" | "UNAVAILABLE" | "AI_UNAVAILABLE";
  reason?: string;
}

/** Re-analyzes every item in the Review Queue, one at a time, with a running tally. */
export function ReanalyzeAllButton({ applicationIds }: { applicationIds: string[] }) {
  const router = useRouter();
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  async function run() {
    setSummary(null);
    const tally = { updated: 0, removed: 0, skipped: 0 };
    let stoppedReason: string | null = null;

    for (let i = 0; i < applicationIds.length; i++) {
      setProgress({ done: i, total: applicationIds.length });
      try {
        const res = await fetch(`/api/applications/${applicationIds[i]}/reanalyze`, { method: "POST" });
        const { result } = (await res.json()) as { result?: Outcome };
        if (result?.status === "UPDATED") tally.updated += 1;
        else if (result?.status === "REMOVED") tally.removed += 1;
        else if (result?.status === "AI_UNAVAILABLE") {
          stoppedReason = result.reason ?? "The AI model is unavailable right now.";
          break;
        } else tally.skipped += 1;
      } catch {
        tally.skipped += 1;
      }
    }

    setProgress(null);
    setSummary(
      `${tally.updated} re-read, ${tally.removed} removed (not real applications), ${tally.skipped} couldn't be re-read` +
        (stoppedReason ? `. Stopped early: ${stoppedReason}` : ".")
    );
    router.refresh();
  }

  if (applicationIds.length === 0) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={run}
        disabled={progress !== null}
        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
      >
        <RefreshCw className={`h-4 w-4 ${progress ? "animate-spin" : ""}`} />
        {progress ? `Re-analyzing ${progress.done + 1}/${progress.total}…` : "Re-analyze all"}
      </button>
      {summary && <p className="max-w-sm text-right text-xs text-slate-500">{summary}</p>}
    </div>
  );
}
