"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/account/delete", { method: "POST" });
    if (!res.ok) {
      setLoading(false);
      setError("Couldn't delete your account. Please try again.");
      return;
    }
    await signOut({ callbackUrl: "/" });
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Delete my account and data
      </button>
      <ConfirmDialog
        open={open}
        title="Delete your account?"
        description="This permanently deletes all your applications, timelines and notifications, removes the stored Gmail access, and signs you out. It can't be undone."
        confirmLabel={loading ? "Deleting…" : "Delete everything"}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      >
        {error && <p className="text-sm text-red-600">{error}</p>}
      </ConfirmDialog>
    </>
  );
}
