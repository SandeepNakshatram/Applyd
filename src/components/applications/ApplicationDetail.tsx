"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { Application, ApplicationEvent } from "@/generated/prisma";
import { StatusBadge } from "./StatusBadge";
import { SourceBadge } from "./SourceBadge";
import { ApplicationTimeline } from "./ApplicationTimeline";
import { applicationStatusValues } from "@/lib/validation";
import { ReanalyzeButton } from "./ReanalyzeButton";

export function ApplicationDetail({
  application,
  events,
}: {
  application: Application;
  events: ApplicationEvent[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    await fetch(`/api/applications/${application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    router.refresh();
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await patch({
      status: form.get("status"),
      nextAction: form.get("nextAction") || null,
      nextActionDate: form.get("nextActionDate") || null,
      notes: form.get("notes") || null,
    });
    setEditing(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{application.role}</h1>
            <p className="text-sm text-slate-500">{application.company}</p>
          </div>
          <div className="flex gap-2">
            <SourceBadge source={application.source} />
            <StatusBadge status={application.currentStatus} />
          </div>
        </div>

        {application.reviewState === "PENDING" && (
          <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            This application was detected with {Math.round(application.confidence * 100)}% confidence
            and needs your review.
            <div className="mt-2 flex gap-2">
              <button
                onClick={() => patch({ reviewAction: "confirm" })}
                className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700"
              >
                Confirm
              </button>
              <button
                onClick={() => patch({ reviewAction: "ignore" })}
                className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Ignore
              </button>
              <button
                onClick={() => setEditing(true)}
                className="rounded-md border border-amber-300 px-3 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <Field label="Applied date" value={application.appliedAt ? format(new Date(application.appliedAt), "MMM d, yyyy") : "—"} />
          <Field label="Next action" value={application.nextAction ?? "—"} />
          <Field
            label="Next action date"
            value={application.nextActionDate ? format(new Date(application.nextActionDate), "MMM d, yyyy") : "—"}
          />
          <Field label="Detected from email" value={events.some((e) => e.emailId) ? "Yes" : "No — added manually"} />
        </dl>

        {application.notes && (
          <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            {application.notes}
          </p>
        )}

        {!editing ? (
          <div className="mt-4 flex items-start gap-4">
            <button
              onClick={() => setEditing(true)}
              className="text-sm font-medium text-blue-600 hover:text-blue-700"
            >
              Edit details
            </button>
            {events.some((e) => e.emailId) && (
              <ReanalyzeButton applicationId={application.id} onDetailPage />
            )}
          </div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                <select name="status" defaultValue={application.currentStatus} className="input">
                  {applicationStatusValues.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Next action date</label>
                <input
                  type="date"
                  name="nextActionDate"
                  defaultValue={application.nextActionDate ? format(new Date(application.nextActionDate), "yyyy-MM-dd") : ""}
                  className="input"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Next action</label>
              <input name="nextAction" defaultValue={application.nextAction ?? ""} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Notes</label>
              <textarea name="notes" defaultValue={application.notes ?? ""} rows={3} className="input" />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6">
        <p className="mb-4 text-sm font-semibold text-slate-900">Timeline</p>
        <ApplicationTimeline events={events} />
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value}</dd>
    </div>
  );
}
