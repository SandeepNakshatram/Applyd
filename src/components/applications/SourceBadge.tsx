import type { ApplicationSource } from "@/generated/prisma";

const SOURCE_LABELS: Record<ApplicationSource, string> = {
  LINKEDIN: "LinkedIn",
  NAUKRI: "Naukri",
  REFERRAL: "Referral",
  COMPANY_WEBSITE: "Company site",
  OTHER: "Other",
};

export function SourceBadge({ source }: { source: ApplicationSource }) {
  return (
    <span className="inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
      {SOURCE_LABELS[source]}
    </span>
  );
}
