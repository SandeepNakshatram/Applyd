import type { ApplicationStatus, EmailEventType } from "@/generated/prisma";
import type { ClassificationResult, ExtractionResult, RawEmail } from "@/types/pipeline";
import { deterministicPreClassify } from "./deterministicClassifier";
import { detectSource } from "./sourceDetector";
import type { AIClient } from "./types";

/**
 * Rule-based classifier + extractor. Used as the default AI client when
 * GEMINI_API_KEY isn't configured (local dev, CI, tests) and as the fallback
 * whenever the Gemini call itself fails (quota, outage), so a transient AI
 * problem degrades gracefully instead of losing the email entirely.
 *
 * It is deliberately conservative: anything it can't pin down becomes null at
 * low confidence (-> Review Queue) rather than a guess. Captured values never
 * span a sentence boundary — an earlier version's lazy `.+?` ran across
 * sentences and produced a "company" of "the earliest" at 90% confidence.
 */

interface KeywordRule {
  eventType: EmailEventType;
  patterns: RegExp[];
  confidence: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    eventType: "REJECTION",
    confidence: 0.9,
    patterns: [
      /will not be moving forward/i,
      /not moving forward with your application/i,
      /decided not to proceed/i,
      /other candidates/i,
      /not selected/i,
      /regret to inform/i,
    ],
  },
  {
    eventType: "OFFER",
    confidence: 0.93,
    patterns: [/pleased to offer/i, /delighted to offer/i, /offer letter/i, /extend an offer/i],
  },
  {
    eventType: "INTERVIEW",
    confidence: 0.9,
    patterns: [
      /interview invitation/i,
      /schedule an interview/i,
      /invite you to interview/i,
      /interview with you/i,
      /like to interview/i,
      /interview invite\b/i,
      /scheduled an interview/i,
    ],
  },
  {
    eventType: "ASSESSMENT",
    confidence: 0.88,
    patterns: [/online assessment/i, /coding (test|assessment)/i, /complete (the|your) (test|assessment)/i],
  },
  {
    eventType: "SCREENING",
    confidence: 0.85,
    patterns: [/screening stage/i, /moved to the next stage/i, /reviewing your profile/i, /under review/i],
  },
  {
    eventType: "APPLICATION_CONFIRMATION",
    confidence: 0.9,
    patterns: [
      /received your application/i,
      /application was sent/i,
      /applied successfully/i,
      /thank you for applying/i,
      /application sent successfully/i,
      /submitted your referral/i,
      /referral (submitted|for)/i,
      /has been sent successfully/i,
    ],
  },
  {
    eventType: "RECRUITER_OUTREACH",
    confidence: 0.7,
    patterns: [/came across your profile/i, /reaching out because/i, /interested in your profile/i],
  },
];

function classifyByKeywords(email: RawEmail): ClassificationResult {
  const text = `${email.subject} ${email.body}`;
  for (const rule of KEYWORD_RULES) {
    if (rule.patterns.some((re) => re.test(text))) {
      return {
        eventType: rule.eventType,
        confidence: rule.confidence,
        reasoning: "keyword-rule",
        engine: "heuristic",
      };
    }
  }
  return { eventType: "IRRELEVANT", confidence: 0.55, reasoning: "no-keyword-match", engine: "heuristic" };
}

const EVENT_TYPE_TO_STATUS: Partial<Record<EmailEventType, ApplicationStatus>> = {
  APPLICATION_CONFIRMATION: "APPLIED",
  SCREENING: "SCREENING",
  ASSESSMENT: "ASSESSMENT",
  INTERVIEW: "INTERVIEW",
  REJECTION: "REJECTED",
  OFFER: "OFFER",
};

interface ExtractionPattern {
  regex: RegExp;
  confidence: number;
}

// A role/company capture must stay inside one sentence: no periods, no newlines.
const ROLE = String.raw`(?<role>[^.\n]{2,100}?)`;
const COMPANY = String.raw`(?<company>[\p{L}\p{N}&.,' -]+?)`;

// Tried in order; first match wins. Named capture groups: role, company, ats.
const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  {
    regex: new RegExp(String.raw`next step for your ${ROLE} application \(Job ID: (?<ats>[A-Za-z0-9-]+)\) at ${COMPANY},`, "iu"),
    confidence: 0.93,
  },
  {
    regex: new RegExp(String.raw`applying for ${ROLE} at ${COMPANY}\.\s*We have received your application \(Job ID:\s*(?<ats>[A-Za-z0-9-]+)\)`, "iu"),
    confidence: 0.93,
  },
  { regex: new RegExp(String.raw`applying for ${ROLE} at ${COMPANY}\.`, "iu"), confidence: 0.9 },
  // "...applying for the role of Technology Analyst." — the employer is not in the sentence.
  { regex: new RegExp(String.raw`applying for the role of ${ROLE}(?:\.|,| at )`, "iu"), confidence: 0.85 },
  {
    regex: new RegExp(String.raw`position of ${ROLE} at (?<company>[\p{L}\p{N}&.,'() -]+?) has been sent`, "iu"),
    confidence: 0.9,
  },
  { regex: new RegExp(String.raw`sent to ${COMPANY}\..*?for the ${ROLE} position`, "isu"), confidence: 0.9 },
  { regex: new RegExp(String.raw`referral for the ${ROLE} role at ${COMPANY} today`, "iu"), confidence: 0.85 },
  { regex: new RegExp(String.raw`applying to the ${ROLE} role at ${COMPANY}\.`, "iu"), confidence: 0.9 },
  { regex: new RegExp(String.raw`interview with you for the ${ROLE} position at ${COMPANY}\.`, "iu"), confidence: 0.9 },
  { regex: new RegExp(String.raw`interest in the ${ROLE} role at ${COMPANY}\.`, "iu"), confidence: 0.9 },
  { regex: new RegExp(String.raw`offer you the position of ${ROLE} at ${COMPANY}\.`, "iu"), confidence: 0.9 },
  // "Thanks for applying to Schrödinger." — ATS confirmations often name only the employer.
  {
    regex: new RegExp(String.raw`(?:thank you for|thanks for) applying (?:to|at|with) (?<company>[\p{L}\p{N}&' -]+?)[.!,]`, "iu"),
    confidence: 0.8,
  },
];

const DATE_PATTERN = /on ([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+ \d{4})/;
const ATS_ID_PATTERN =
  /(?:Job ID|Candidate ID|Application ID|Requisition ID|Reference (?:No|Number)):?\s*([A-Za-z0-9-]+)/i;

// "Regarding your application with Infosys" — the employer is often only in the subject.
const SUBJECT_COMPANY_PATTERN = /application (?:with|to|at) (?<company>\p{Lu}[\p{L}\p{N}&,'() -]{1,60}?)\s*$/u;

function parseLooseDate(raw: string): string | null {
  const cleaned = raw.replace(",", "");
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function extractByPatterns(email: RawEmail): {
  company: string | null;
  role: string | null;
  applicationDate: string | null;
  atsIdentifier: string | null;
  confidence: number;
} {
  // Body only (not subject+body): several subjects repeat phrases like
  // "applying for <role>" without the trailing "at <company>".
  const text = email.body;
  const atsFromText = text.match(ATS_ID_PATTERN)?.[1] ?? email.subject.match(ATS_ID_PATTERN)?.[1] ?? null;
  const dateMatch = text.match(DATE_PATTERN);
  const applicationDate = dateMatch ? parseLooseDate(dateMatch[1]) : null;
  const companyFromSubject = email.subject.match(SUBJECT_COMPANY_PATTERN)?.groups?.company?.trim() ?? null;

  for (const { regex, confidence } of EXTRACTION_PATTERNS) {
    const match = text.match(regex);
    if (match?.groups) {
      return {
        company: match.groups.company?.trim().replace(/[.,]$/, "") ?? companyFromSubject,
        role: match.groups.role?.trim().replace(/[.,]$/, "") ?? null,
        applicationDate,
        atsIdentifier: match.groups.ats?.trim() ?? atsFromText,
        confidence,
      };
    }
  }

  // No role pattern matched — keep whatever structured hints we do have, at
  // low confidence, so the item lands in the Review Queue with some context.
  return {
    company: companyFromSubject,
    role: null,
    applicationDate,
    atsIdentifier: atsFromText,
    confidence: companyFromSubject || atsFromText ? 0.5 : 0.35,
  };
}

export const heuristicClient: AIClient = {
  async classifyEmail(email: RawEmail): Promise<ClassificationResult> {
    const deterministic = deterministicPreClassify(email);
    if (deterministic) return deterministic;
    return classifyByKeywords(email);
  },

  async extractApplication(
    email: RawEmail,
    classification: ClassificationResult
  ): Promise<ExtractionResult> {
    if (classification.eventType === "JOB_ALERT" || classification.eventType === "IRRELEVANT") {
      return {
        company: null,
        role: null,
        applicationDate: null,
        source: null,
        status: null,
        eventType: classification.eventType,
        confidence: classification.confidence,
        atsIdentifier: null,
      };
    }

    const extracted = extractByPatterns(email);
    const source = detectSource(email);
    const status = EVENT_TYPE_TO_STATUS[classification.eventType] ?? null;
    const overallConfidence = Math.min(classification.confidence, extracted.confidence);

    return {
      company: extracted.company,
      role: extracted.role,
      applicationDate: extracted.applicationDate,
      source,
      status,
      eventType: classification.eventType,
      confidence: overallConfidence,
      atsIdentifier: extracted.atsIdentifier,
    };
  },
};
