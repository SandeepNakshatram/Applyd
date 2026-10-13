"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { applicationStatusValues, applicationSourceValues } from "@/lib/validation";
import { STATUS_LABELS, SOURCE_LABELS } from "@/lib/labels";

export function ApplicationForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = {
      company: form.get("company"),
      role: form.get("role"),
      appliedAt: form.get("appliedAt") || null,
      source: form.get("source"),
      status: form.get("status"),
      nextAction: form.get("nextAction") || null,
      nextActionDate: form.get("nextActionDate") || null,
      notes: form.get("notes") || null,
      jobUrl: String(form.get("jobUrl") ?? "").trim() || null,
    };

    const res = await fetch("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSubmitting(false);

    if (!res.ok) {
      setError("Please check the fields (the job link must start with http:// or https://) and try again.");
      return;
    }

    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Add application</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3">
          <Field label="Company" name="company" required />
          <Field label="Role" name="role" required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Application date" name="appliedAt" type="date" />
            <div>
              <Label required>Source</Label>
              <select name="source" required defaultValue="OTHER" className="input">
                {applicationSourceValues.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <Label required>Status</Label>
            <select name="status" required defaultValue="APPLIED" className="input">
              {applicationStatusValues.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
          <Field label="Job posting link" name="jobUrl" type="url" placeholder="https://…" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Next action" name="nextAction" />
            <Field label="Next action date" name="nextActionDate" type="date" />
          </div>
          <div>
            <Label>Notes</Label>
            <textarea name="notes" rows={3} className="input" />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {submitting ? "Saving…" : "Save application"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="mb-1 block text-xs font-medium text-slate-600">
      {children}
      {required && (
        <span className="ml-0.5 text-red-600" aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <Label required={required}>{label}</Label>
      <input name={name} type={type} required={required} placeholder={placeholder} className="input" />
    </div>
  );
}
