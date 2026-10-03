import "server-only";
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { ApplicationStatus, EmailEventType } from "@/generated/prisma";
import type { ClassificationResult, ExtractionResult, RawEmail } from "@/types/pipeline";
import { deterministicPreClassify } from "./deterministicClassifier";
import { detectSource } from "./sourceDetector";
import { heuristicClient } from "./heuristicClient";
import type { AIClient } from "./types";

const EVENT_TYPES = [
  "APPLICATION_CONFIRMATION",
  "APPLICATION_STATUS_UPDATE",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "REJECTION",
  "OFFER",
  "RECRUITER_OUTREACH",
  "JOB_ALERT",
  "IRRELEVANT",
] as const satisfies readonly EmailEventType[];

const STATUSES = [
  "APPLIED",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "OFFER",
  "REJECTED",
  "WITHDRAWN",
] as const satisfies readonly ApplicationStatus[];

interface CombinedResult {
  eventType: unknown;
  classificationConfidence: unknown;
  reasoning: unknown;
  company: unknown;
  role: unknown;
  applicationDate: unknown;
  status: unknown;
  atsIdentifier: unknown;
  extractionConfidence: unknown;
}

/**
 * AI stage backed by Google Gemini. Classification and extraction are asked
 * for in a single call (one combined JSON schema) rather than two separate
 * requests — half the API usage per email, which matters a lot against the
 * Gemini API's free-tier daily request quota, and meaningfully speeds up a
 * scan too. The AIClient interface still exposes them as two methods (ingest
 * code and tests depend on that shape); `extractApplication` just reads the
 * extraction half out of a short-lived per-email cache instead of making its
 * own call when it immediately follows `classifyEmail` for the same email,
 * which is how ingest.ts always uses it.
 *
 * Both calls request strict JSON via responseSchema so we never depend on
 * parsing free-form text (spec section 7). Every call is wrapped so a
 * Gemini failure (quota, rate limit, network, bad JSON) falls back to the
 * deterministic heuristic client rather than crashing the whole ingestion
 * run — but every fallback is logged, since a silent one is indistinguishable
 * from the heuristic just being used on purpose.
 */
export class GeminiClient implements AIClient {
  private client: GoogleGenerativeAI;
  private modelName: string;
  private pendingExtractions = new Map<string, ExtractionResult>();

  constructor(apiKey: string, modelName: string) {
    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  async classifyEmail(email: RawEmail): Promise<ClassificationResult> {
    const deterministic = deterministicPreClassify(email);
    if (deterministic) return deterministic;

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              eventType: { type: SchemaType.STRING, format: "enum", enum: [...EVENT_TYPES] },
              classificationConfidence: { type: SchemaType.NUMBER },
              reasoning: { type: SchemaType.STRING },
              company: { type: SchemaType.STRING, nullable: true },
              role: { type: SchemaType.STRING, nullable: true },
              applicationDate: { type: SchemaType.STRING, nullable: true },
              status: { type: SchemaType.STRING, format: "enum", enum: [...STATUSES], nullable: true },
              atsIdentifier: { type: SchemaType.STRING, nullable: true },
              extractionConfidence: { type: SchemaType.NUMBER },
            },
            required: ["eventType", "classificationConfidence", "extractionConfidence"],
          },
        },
      });

      const result = await model.generateContent(buildCombinedPrompt(email));
      const parsed = JSON.parse(result.response.text()) as CombinedResult;
      if (!EVENT_TYPES.includes(parsed.eventType as EmailEventType)) {
        throw new Error("invalid eventType");
      }
      const eventType = parsed.eventType as EmailEventType;
      const classificationConfidence = clamp01(parsed.classificationConfidence);

      // Source is deterministic-only, never trust the model here (spec section 8).
      const source =
        eventType === "JOB_ALERT" || eventType === "IRRELEVANT" ? null : detectSource(email);

      this.pendingExtractions.set(email.providerMessageId, {
        company: nullableString(parsed.company),
        role: nullableString(parsed.role),
        applicationDate: nullableString(parsed.applicationDate),
        source,
        status: STATUSES.includes(parsed.status as ApplicationStatus)
          ? (parsed.status as ApplicationStatus)
          : null,
        eventType,
        confidence: clamp01(parsed.extractionConfidence),
        atsIdentifier: nullableString(parsed.atsIdentifier),
      });

      return {
        eventType,
        confidence: classificationConfidence,
        reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : undefined,
        engine: "gemini",
      };
    } catch (err) {
      console.error("[GeminiClient] classify+extract failed, falling back to heuristic:", err);
      return heuristicClient.classifyEmail(email);
    }
  }

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

    const cached = this.pendingExtractions.get(email.providerMessageId);
    if (cached) {
      this.pendingExtractions.delete(email.providerMessageId);
      return cached;
    }

    // No cached extraction (e.g. classifyEmail took the deterministic or
    // heuristic-fallback path) — fall back to the heuristic extractor rather
    // than spending a second Gemini call just for this.
    return heuristicClient.extractApplication(email, classification);
  }
}

function buildCombinedPrompt(email: RawEmail): string {
  return `You read one email for a job-application tracker and return JSON: first CLASSIFY it, then EXTRACT fields.

## Classification (eventType) — pick exactly one
- APPLICATION_CONFIRMATION: the recipient applied for a JOB (employment) and this confirms it was received/submitted, or asks them to complete/finish that application.
- APPLICATION_STATUS_UPDATE: a generic status change on a job application the recipient already made.
- SCREENING: profile shortlisted / under review / recruiter screening call.
- ASSESSMENT: a test, coding challenge, or assignment to complete.
- INTERVIEW: an interview is being invited, scheduled or confirmed.
- OFFER: a job offer.
- REJECTION: the application was declined / not moving forward.
- RECRUITER_OUTREACH: a real person (recruiter/hiring manager) writing to the recipient about a role. The recipient has NOT applied.
- JOB_ALERT: automated marketing from a job board or recruiter tool — "jobs for you", "great match", "you're invited to apply", "Apply Now" buttons, saved-search digests. The recipient has NOT applied. This is never an application.
- IRRELEVANT: anything else. IMPORTANT: "applications" that are NOT for a job are IRRELEVANT — school/college/university admissions or entrance tests, exam registrations/results, scholarships, course enrolment, visas, loans, event tickets, newsletters.

## Extraction (leave every field null unless the email supports it — never guess)
- company: the EMPLOYER. Use the explicit name; if the email is sent by the employer, take it from the subject, signature ("Infosys Limited"), or sender domain. NEVER use a job board / ATS (Naukri, LinkedIn, Foundit, Indeed, Workday, Greenhouse...) as the company.
- role: the job title only (e.g. "Technology Analyst"), not a sentence. null if the email doesn't state one.
- applicationDate: ISO YYYY-MM-DD of when the person applied, only if stated; otherwise null.
- status: APPLIED (applied, or asked to complete the application), SCREENING, ASSESSMENT, INTERVIEW, OFFER, REJECTED, WITHDRAWN. Match it to the stage this email is about.
- atsIdentifier: any Candidate ID / Application ID / Job ID / Requisition ID / reference number.
- For JOB_ALERT and IRRELEVANT, return null for all extraction fields.

## Examples
- "Regarding your application with Infosys — Thank you for applying for the role of Technology Analyst. Please log in to complete your application." from TalentAcquisition@infosys.com
  => APPLICATION_CONFIRMATION, company "Infosys", role "Technology Analyst", status APPLIED.
- "Interview Invite: Alex | Candidate ID: 1004334000 ... We have scheduled an interview for you" from talent-acquisition@infosys.com
  => INTERVIEW, company "Infosys", role null, status INTERVIEW, atsIdentifier "1004334000".
- "Congratulations on completing the Admissions Test! Your application has been submitted" from a business school => IRRELEVANT (admissions, not a job).
- "You're invited to apply for the Java Developer role at Acme — This role is a great match! [Apply Now]" from a job board => JOB_ALERT.

## Email
Received: ${email.receivedAt.toISOString().slice(0, 10)}
From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}

Respond with JSON only: {
  "eventType": string,
  "classificationConfidence": number between 0 and 1,
  "reasoning": short string,
  "company": string or null,
  "role": string or null,
  "applicationDate": string or null,
  "status": string or null,
  "atsIdentifier": string or null,
  "extractionConfidence": number between 0 and 1
}`;
}

function clamp01(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (Number.isNaN(num)) return 0.5;
  return Math.min(1, Math.max(0, num));
}

function nullableString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}
