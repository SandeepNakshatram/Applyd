import type { ClassificationResult, RawEmail } from "@/types/pipeline";

/**
 * Deterministic pre-classification, run before any AI call. Three rules matter
 * most for correctness (spec section 6): a JOB_ALERT must never reach the
 * extractor/resolver and create an application, applications to things that
 * aren't jobs (school admissions, exams, scholarships) must be dropped, and
 * obvious newsletter/promo noise shouldn't burn an AI call. Everything else is
 * left to the next stage.
 */

/** Automated job recommendations / "apply now" marketing — the recipient has NOT applied. */
const JOB_ALERT_PATTERNS = [
  /jobs? matching your (preferences|search|profile)/i,
  /new jobs? (for|recommended for) you/i,
  /recommended jobs?/i,
  /jobs? you may be interested in/i,
  /\bjob alert\b/i,
  /based on your profile.{0,30}jobs?/i,
  /you(?:'|’)?re invited to apply/i,
  /invited you to apply/i,
  /\b(?:is|are|this role is) a (?:great|strong|perfect) match\b/i,
  /\b(?:great|strong|perfect) match for (?:you|your profile)\b/i,
  /\bsimilar jobs\b/i,
  /\bapply now\b/i,
  /\bjobs? (?:picked|selected|curated) for you\b/i,
];

/** Things people "apply" to that are not employment. */
const NON_JOB_PATTERNS = [
  /\badmissions?\b/i,
  /\bscholarships?\b/i,
  /\benrol(?:l)?ment\b/i,
  /\bexamination\b/i,
  /\bexam (?:registration|result|schedule|hall ticket)\b/i,
  /\bacademic (?:year|session|programme|program)\b/i,
  /\b(?:hall ticket|admit card)\b/i,
];

/** If any of these are present the mail is about employment, so NON_JOB_PATTERNS don't apply. */
const EMPLOYMENT_SIGNALS = [
  /\b(?:job|role|position|vacancy|vacancies|hiring|recruit(?:er|ment|ing)?|employment|career|candidate id|requisition)\b/i,
  /\binterview\b/i,
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
    return {
      eventType: "JOB_ALERT",
      confidence: 0.97,
      reasoning: "job-alert-pattern",
      engine: "deterministic",
    };
  }

  const isAboutEmployment = EMPLOYMENT_SIGNALS.some((re) => re.test(text));
  if (!isAboutEmployment && NON_JOB_PATTERNS.some((re) => re.test(text))) {
    return {
      eventType: "IRRELEVANT",
      confidence: 0.95,
      reasoning: "non-job-application (admissions/exam/scholarship)",
      engine: "deterministic",
    };
  }

  const domain = email.fromDomain.toLowerCase();
  const isKnownJobDomain = KNOWN_JOB_DOMAINS.some((d) => domain.endsWith(d));
  const hasApplicationSignal = APPLICATION_SIGNAL_KEYWORDS.some((k) =>
    text.toLowerCase().includes(k)
  );

  if (!isKnownJobDomain && !hasApplicationSignal) {
    return {
      eventType: "IRRELEVANT",
      confidence: 0.92,
      reasoning: "no-job-signal",
      engine: "deterministic",
    };
  }

  return null;
}
