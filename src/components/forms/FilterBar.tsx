"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { applicationStatusValues, applicationSourceValues } from "@/lib/validation";
import { STATUS_LABELS, SOURCE_LABELS } from "@/lib/labels";
import { SORT_OPTIONS } from "@/lib/applicationsQuery";

const CONTROL = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700";

export function FilterBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = ["status", "source", "dateFrom", "dateTo", "sort"].some((k) => searchParams.get(k));

  return (
    <div
      key={["status", "source", "dateFrom", "dateTo", "sort"].map((k) => searchParams.get(k) ?? "").join("|")}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Status
        <select
          defaultValue={searchParams.get("status") ?? ""}
          onChange={(e) => updateParam("status", e.target.value)}
          className={CONTROL}
        >
          <option value="">All statuses</option>
          {applicationStatusValues.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Source
        <select
          defaultValue={searchParams.get("source") ?? ""}
          onChange={(e) => updateParam("source", e.target.value)}
          className={CONTROL}
        >
          <option value="">All sources</option>
          {applicationSourceValues.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABELS[s]}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Applied from
        <input
          type="date"
          defaultValue={searchParams.get("dateFrom") ?? ""}
          onChange={(e) => updateParam("dateFrom", e.target.value)}
          className={CONTROL}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Applied to
        <input
          type="date"
          defaultValue={searchParams.get("dateTo") ?? ""}
          onChange={(e) => updateParam("dateTo", e.target.value)}
          className={CONTROL}
        />
      </label>

      <label className="flex flex-col gap-1 text-xs font-medium text-slate-500">
        Sort by
        <select
          defaultValue={searchParams.get("sort") ?? "recent"}
          onChange={(e) => updateParam("sort", e.target.value === "recent" ? "" : e.target.value)}
          className={CONTROL}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            ["status", "source", "dateFrom", "dateTo", "sort"].forEach((k) => params.delete(k));
            router.push(`${pathname}?${params.toString()}`);
          }}
          className="pb-2 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
