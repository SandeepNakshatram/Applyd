"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { ApplicationForm } from "./ApplicationForm";

export function AddApplicationButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-700"
      >
        <Plus className="h-4 w-4" />
        Add Application
      </button>
      {open && <ApplicationForm onClose={() => setOpen(false)} />}
    </>
  );
}
