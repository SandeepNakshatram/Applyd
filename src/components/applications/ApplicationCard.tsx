"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Mail } from "lucide-react";
import { SourceBadge } from "./SourceBadge";
import { StatusBadge } from "./StatusBadge";
import type { Application } from "@/generated/prisma";
import { gmailMessageUrl } from "@/lib/email/gmailLink";
import { displayCompany, displayRole, isUnknownCompany, isUnknownRole } from "@/lib/placeholders";
import { ReanalyzeButton } from "./ReanalyzeButton";

/** Review Queue card (spec section 15): company/role/source/status + why it's here + confirm/edit/ignore. */
export function ApplicationCard({
  application,
  sourceEmailId,
  reason,
}: {
  application: Application;
  /** The Gmail message ID that produced this application/event, if any (manual entries have none). */
  sourceEmailId: string | null;
  /** Plain-language reason this needs a human look. */
  reason: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [company, setCompany] = useState(isUnknownCompany(application.company) ? "" : application.company);
  const [role, setRole] = useState(isUnknownRole(application.role) ? "" : application.role);

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

  async function saveAndConfirm() {
    // Only send what the user actually filled in; blanks leave the stored value alone.
    await patch({
      ...(company.trim() ? { company: company.trim() } : {}),
      ...(role.trim() ? { role: role.trim() } : {}),
      reviewAction: "confirm",
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold text-slate-900">{displayCompany(application.company)}</p>
          <p className="text-sm text-slate-500">{displayRole(application.role)}</p>
          <div className="mt-2 flex items-center gap-2">
            <SourceBadge source={application.source} />
            <StatusBadge status={application.currentStatus} />
          </div>
        </div>
        <span className="whitespace-nowrap text-xs font-medium text-slate-500">
          Confidence: {Math.round(application.confidence * 100)}%
        </span>
      </div>

      <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">{reason}</p>

      {editing && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
            aria-label="Company"
            className="input"
          />
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Role (as on the job post)"
            aria-label="Role"
            className="input"
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {editing ? (
          <>
            <button
              onClick={saveAndConfirm}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & confirm"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => patch({ reviewAction: "confirm" })}
              disabled={saving}
              className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              Confirm
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Edit
            </button>
            <button
              onClick={() => patch({ reviewAction: "ignore" })}
              disabled={saving}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Ignore
            </button>
          </>
        )}
        {sourceEmailId && !editing && <ReanalyzeButton applicationId={application.id} />}
        {sourceEmailId && (
          <a
            href={gmailMessageUrl(sourceEmailId)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <Mail className="h-3.5 w-3.5" />
            Check email
          </a>
        )}
      </div>
    </div>
  );
}
