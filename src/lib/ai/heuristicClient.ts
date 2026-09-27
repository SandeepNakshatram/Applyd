import type { ApplicationStatus, EmailEventType } from "@/generated/prisma";
import type { ClassificationResult, ExtractionResult, RawEmail } from "@/types/pipeline";
import { deterministicPreClassify } from "./deterministicClassifier";
import { detectSource } from "./sourceDetector";
import type { AIClient } from "./types";

/**
 * Rule-based classifier + extractor. Used as the default AI client when
 * GEMINI_API_KEY isn't configured (local dev, CI, tests) and as the fallback
 * whenever the Gemini call itself fails, so a transient AI outage degrades
 * gracefully instead of losing the email entirely.
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
      return { eventType: rule.eventType, confidence: rule.confidence, reasoning: "keyword-rule" };
    }
  }
  return { eventType: "IRRELEVANT", confidence: 0.55, reasoning: "no-keyword-match" };
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

// Tried in order; first match wins. Named capture groups: role, company, date, ats.
const EXTRACTION_PATTERNS: ExtractionPattern[] = [
  { regex: /next step for your (?<role>.+?) application \(Job ID: (?<ats>[A-Za-z0-9-]+)\) at (?<company>[A-Za-z0-9&.,' -]+?),/i, confidence: 0.93 },
  { regex: /applying for (?<role>.+?) at (?<company>[A-Za-z0-9&.,' -]+?)\.\s*We have received your application \(Job ID:\s*(?<ats>[A-Za-z0-9-]+)\)/i, confidence: 0.93 },
  { regex: /applying for (?<role>.+?) at (?<company>[A-Za-z0-9&.,' -]+?)\./i, confidence: 0.9 },
  { regex: /position of (?<role>.+?) at (?<company>[A-Za-z0-9&.,'() -]+?) has been sent/i, confidence: 0.9 },
  { regex: /sent to (?<company>[A-Za-z0-9&.,' -]+?)\..*?for the (?<role>.+?) position/is, confidence: 0.9 },
  { regex: /referral for the (?<role>.+?) role at (?<company>[A-Za-z0-9&.,' -]+?) today/i, confidence: 0.85 },
  { regex: /applying to the (?<role>.+?) role at (?<company>[A-Za-z0-9&.,' -]+?)\./i, confidence: 0.9 },
  { regex: /interview with you for the (?<role>.+?) position at (?<company>[A-Za-z0-9&.,' -]+?)\./i, confidence: 0.9 },
  { regex: /interest in the (?<role>.+?) role at (?<company>[A-Za-z0-9&.,' -]+?)\./i, confidence: 0.9 },
  { regex: /offer you the position of (?<role>.+?) at (?<company>[A-Za-z0-9&.,' -]+?)\./i, confidence: 0.9 },
];

const DATE_PATTERN = /on ([A-Za-z]+ \d{1,2},? \d{4}|\d{1,2} [A-Za-z]+ \d{4})/;
const ATS_ID_PATTERN = /Job ID:\s*([A-Za-z0-9-]+)/i;

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
  // Body only (not subject+body): several mock/real subjects repeat phrases like
  // "applying for <role>" without the trailing "at <company>", and concatenating
  // would let the lazy quantifiers below run past the sentence boundary.
  const text = email.body;

  for (const { regex, confidence } of EXTRACTION_PATTERNS) {
    const match = text.match(regex);
    if (match?.groups) {
      const company = match.groups.company?.trim().replace(/[.,]$/, "") ?? null;
      const role = match.groups.role?.trim().replace(/[.,]$/, "") ?? null;
      const atsFromPattern = match.groups.ats?.trim() ?? null;
      const atsFromText = text.match(ATS_ID_PATTERN)?.[1] ?? null;
      const dateMatch = text.match(DATE_PATTERN);
      const applicationDate = dateMatch ? parseLooseDate(dateMatch[1]) : null;
      return {
        company,
        role,
        applicationDate,
        atsIdentifier: atsFromPattern ?? atsFromText,
        confidence,
      };
    }
  }

  return { company: null, role: null, applicationDate: null, atsIdentifier: null, confidence: 0.35 };
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
