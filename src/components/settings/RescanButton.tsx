"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RescanButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    await fetch("/api/scan/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force: true }),
    });
    router.push("/scan");
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      {loading ? "Starting…" : "Rescan inbox"}
    </button>
  );
}
