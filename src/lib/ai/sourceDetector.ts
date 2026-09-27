import type { ApplicationSource } from "@/generated/prisma";
import type { RawEmail } from "@/types/pipeline";

/**
 * Deterministic source detection (spec section 8). This is the single source
 * of truth for `source` — classifiers/extractors (heuristic or AI) must never
 * invent one; callers should always prefer this over anything a model returns.
 */

const LINKEDIN_DOMAINS = ["linkedin.com"];
const NAUKRI_DOMAINS = ["naukri.com"];
const ATS_DOMAINS = [
  "greenhouse.io",
  "lever.co",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "icims.com",
  "bamboohr.com",
  "ashbyhq.com",
  "jobvite.com",
  "successfactors.com",
  "taleo.net",
];

const COMPANY_SENDER_LOCAL_PARTS = [
  "careers",
  "talent",
  "recruiting",
  "recruitment",
  "jobs",
  "hr",
  "hiring",
  "talentacquisition",
  "people",
];

const REFERRAL_KEYWORDS = ["referral", "referred you", "i referred", "submitted your referral"];

export function detectSource(email: RawEmail): ApplicationSource {
  const domain = email.fromDomain.toLowerCase();
  const bodyLower = `${email.subject} ${email.body}`.toLowerCase();
  const localPart = email.from.split("@")[0]?.toLowerCase() ?? "";

  if (LINKEDIN_DOMAINS.some((d) => domain.endsWith(d))) return "LINKEDIN";
  if (NAUKRI_DOMAINS.some((d) => domain.endsWith(d))) return "NAUKRI";
  if (ATS_DOMAINS.some((d) => domain.endsWith(d))) return "COMPANY_WEBSITE";

  if (REFERRAL_KEYWORDS.some((k) => bodyLower.includes(k))) return "REFERRAL";

  if (COMPANY_SENDER_LOCAL_PARTS.some((p) => localPart.includes(p))) {
    return "COMPANY_WEBSITE";
  }

  return "OTHER";
}
