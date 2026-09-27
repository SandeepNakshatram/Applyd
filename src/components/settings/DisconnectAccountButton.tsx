"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

export function DisconnectAccountButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await fetch("/api/account/disconnect", { method: "POST" });
    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50"
      >
        Disconnect Gmail
      </button>
      <ConfirmDialog
        open={open}
        title="Disconnect Gmail?"
        description="Applyd will stop scanning and syncing this inbox. Applications already found will stay in your dashboard."
        confirmLabel={loading ? "Disconnecting…" : "Disconnect"}
        onConfirm={handleConfirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
