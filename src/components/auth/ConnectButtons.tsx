"use client";

import { signIn } from "next-auth/react";
import { Mail, PenLine } from "lucide-react";

export function ConnectGmailButton({ label = "Connect Gmail", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <button
      onClick={() => signIn("google", { callbackUrl: "/scan" })}
      className={
        "flex items-center justify-center gap-2 whitespace-nowrap rounded-lg bg-slate-900 font-semibold text-white shadow-sm transition hover:bg-slate-700 " +
        (compact ? "px-3 py-1.5 text-sm" : "px-6 py-3 text-sm")
      }
    >
      <Mail className="h-4 w-4" />
      {label}
    </button>
  );
}

export function AddManuallyButton() {
  return (
    <button
      onClick={() =>
        signIn(
          "google",
          { callbackUrl: "/dashboard" },
          { scope: "openid email profile" }
        )
      }
      className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
    >
      <PenLine className="h-4 w-4" />
      Add an application manually
    </button>
  );
}
