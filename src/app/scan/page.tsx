"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ScanJob, ScanStage } from "@/generated/prisma";

const STAGE_LABELS: Record<ScanStage, string> = {
  CONNECTING: "Connecting to your inbox…",
  SCANNING_EMAILS: "Scanning existing emails…",
  IDENTIFYING_JOB_EMAILS: "Identifying job-related emails…",
  EXTRACTING_INFO: "Extracting application information…",
  MATCHING_APPLICATIONS: "Matching applications…",
  BUILDING_TIMELINES: "Building application timelines…",
  CREATING_NOTIFICATIONS: "Creating notifications…",
  COMPLETE: "Done!",
  FAILED: "Something went wrong during the scan.",
};

const STAGE_ORDER: ScanStage[] = [
  "CONNECTING",
  "SCANNING_EMAILS",
  "IDENTIFYING_JOB_EMAILS",
  "EXTRACTING_INFO",
  "MATCHING_APPLICATIONS",
  "BUILDING_TIMELINES",
  "CREATING_NOTIFICATIONS",
  "COMPLETE",
];

export default function ScanPage() {
  const router = useRouter();
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let pollTimer: ReturnType<typeof setInterval> | undefined;

    async function start() {
      try {
        const res = await fetch("/api/scan/start", { method: "POST" });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(body.error ?? "Could not start scan.");
          return;
        }
        const { scanJobId } = await res.json();

        pollTimer = setInterval(async () => {
          const jobRes = await fetch(`/api/scan/${scanJobId}`);
          if (!jobRes.ok) return;
          const { scanJob: job } = await jobRes.json();
          setScanJob(job);
          if (job.stage === "COMPLETE" || job.stage === "FAILED") {
            clearInterval(pollTimer);
            if (job.stage === "COMPLETE") {
              setTimeout(() => router.push("/dashboard"), 1200);
            }
          }
        }, 1000);
      } catch {
        setError("Could not start scan.");
      }
    }

    start();
    return () => {
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [router]);

  const stageIndex = scanJob ? STAGE_ORDER.indexOf(scanJob.stage) : 0;
  const progressPct = scanJob
    ? Math.round(((stageIndex + 1) / STAGE_ORDER.length) * 100)
    : 5;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-900">Your inbox is connected.</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">
          {error ? "Scan failed" : scanJob ? STAGE_LABELS[scanJob.stage] : "Finding your applications…"}
        </p>

        {!error && (
          <div className="mt-6 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-slate-900 transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}

        {scanJob && !error && (
          <dl className="mt-6 grid grid-cols-2 gap-4 text-left">
            <Stat label="Applications found" value={scanJob.applicationsFound} />
            <Stat label="Need review" value={scanJob.needsReviewCount} />
            <Stat label="Emails scanned" value={scanJob.emailsScanned} />
            <Stat label="Relevant emails" value={scanJob.emailsRelevant} />
          </dl>
        )}

        {error && (
          <div className="mt-4">
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Go to dashboard
            </button>
          </div>
        )}

        {scanJob?.stage === "FAILED" && (
          <div className="mt-4">
            <p className="text-sm text-red-600">{scanJob.error}</p>
            <button
              onClick={() => router.push("/dashboard")}
              className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
            >
              Go to dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold text-slate-900">{value}</dd>
    </div>
  );
}
