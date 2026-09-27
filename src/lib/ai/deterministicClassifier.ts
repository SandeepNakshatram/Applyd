import type { ClassificationResult, RawEmail } from "@/types/pipeline";

/**
 * Deterministic pre-classification, run before any AI call. Two rules matter
 * most for correctness (spec section 6): a JOB_ALERT must never reach the
 * extractor/resolver and create an application, and obvious newsletter/promo
 * noise shouldn't burn an AI call. Everything else is left to the next stage.
 */

const JOB_ALERT_PATTERNS = [
  /jobs? matching your (preferences|search|profile)/i,
  /new jobs? (for|recommended for) you/i,
  /recommended jobs?/i,
  /jobs? you may be interested in/i,
  /\bjob alert\b/i,
  /based on your profile.{0,30}jobs?/i,
];

const APPLICATION_SIGNAL_KEYWORDS = [
  "apply",
  "applying",
  "applied",
  "application",
  "interview",
  "screening",
  "assessment",
  "offer",
  "reject",
  "candidacy",
  "candidate",
  "hiring",
  "recruiter",
  "referral",
  "position",
  "role at",
];

const KNOWN_JOB_DOMAINS = [
  "linkedin.com",
  "naukri.com",
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

export function deterministicPreClassify(email: RawEmail): ClassificationResult | null {
  const text = `${email.subject} ${email.body}`;

  if (JOB_ALERT_PATTERNS.some((re) => re.test(text))) {
    return { eventType: "JOB_ALERT", confidence: 0.97, reasoning: "job-alert-pattern" };
  }

  const domain = email.fromDomain.toLowerCase();
  const isKnownJobDomain = KNOWN_JOB_DOMAINS.some((d) => domain.endsWith(d));
  const hasApplicationSignal = APPLICATION_SIGNAL_KEYWORDS.some((k) =>
    text.toLowerCase().includes(k)
  );

  if (!isKnownJobDomain && !hasApplicationSignal) {
    return { eventType: "IRRELEVANT", confidence: 0.92, reasoning: "no-job-signal" };
  }

  return null;
}
