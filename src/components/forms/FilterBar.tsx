"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { applicationStatusValues, applicationSourceValues } from "@/lib/validation";

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

  return (
    <div className="flex flex-wrap gap-2">
      <select
        defaultValue={searchParams.get("status") ?? ""}
        onChange={(e) => updateParam("status", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
      >
        <option value="">All statuses</option>
        {applicationStatusValues.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <select
        defaultValue={searchParams.get("source") ?? ""}
        onChange={(e) => updateParam("source", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
      >
        <option value="">All sources</option>
        {applicationSourceValues.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <input
        type="date"
        defaultValue={searchParams.get("dateFrom") ?? ""}
        onChange={(e) => updateParam("dateFrom", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        aria-label="From date"
      />
      <input
        type="date"
        defaultValue={searchParams.get("dateTo") ?? ""}
        onChange={(e) => updateParam("dateTo", e.target.value)}
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
        aria-label="To date"
      />
    </div>
  );
}
