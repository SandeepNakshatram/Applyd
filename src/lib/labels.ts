import type { ApplicationSource, ApplicationStatus } from "@/generated/prisma";

/** Human-readable labels for enum values — never show raw enum names in the UI. */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
  APPLIED: "Applied",
  SCREENING: "Screening",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  OFFER: "Offer",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const SOURCE_LABELS: Record<ApplicationSource, string> = {
  LINKEDIN: "LinkedIn",
  NAUKRI: "Naukri",
  REFERRAL: "Referral",
  COMPANY_WEBSITE: "Company website",
  OTHER: "Other",
};

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}
