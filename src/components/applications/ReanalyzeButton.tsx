"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

type Result =
  | { status: "UPDATED"; applicationId: string }
  | { status: "REMOVED"; reason: string }
  | { status: "UNAVAILABLE"; reason: string }
  | { status: "AI_UNAVAILABLE"; reason: string };

/**
 * Re-reads the original email with the current AI pipeline and replaces this
 * application with the result. Fixes items extracted badly earlier (or wrongly
 * kept, e.g. a job-board ad) without anyone touching the database.
 */
export function ReanalyzeButton({
  applicationId,
  onDetailPage = false,
}: {
  applicationId: string;
  /** On the detail page the app may be replaced/removed, so navigate instead of just refreshing. */
  onDetailPage?: boolean;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "ok" | "warn" } | null>(null);

  async function run() {
    setRunning(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/reanalyze`, { method: "POST" });
      const { result } = (await res.json()) as { result?: Result };
      if (!result) {
        setMessage({ text: "Something went wrong. Try again.", tone: "warn" });
        return;
      }

      if (result.status === "UPDATED") {
        if (onDetailPage && result.applicationId !== applicationId) {
          router.push(`/applications/${result.applicationId}`);
        } else {
          router.refresh();
        }
      } else if (result.status === "REMOVED") {
        setMessage({ text: result.reason, tone: "ok" });
        setTimeout(() => (onDetailPage ? router.push("/dashboard") : router.refresh()), 1500);
      } else {
        setMessage({ text: result.reason, tone: "warn" });
      }
    } catch {
      setMessage({ text: "Something went wrong. Try again.", tone: "warn" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        onClick={run}
        disabled={running}
        className="flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
        {running ? "Re-analyzing…" : "Re-analyze"}
      </button>
      {message && (
        <p className={`max-w-xs text-xs ${message.tone === "ok" ? "text-emerald-700" : "text-amber-700"}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
