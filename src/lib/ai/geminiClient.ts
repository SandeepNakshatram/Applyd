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
  return `You classify and extract structured data from an email for a job application tracker, in one pass.

First, classify it into one category: ${EVENT_TYPES.join(", ")}
- APPLICATION_CONFIRMATION: confirms a job application was submitted.
- APPLICATION_STATUS_UPDATE: a generic status change on an existing application.
- SCREENING / ASSESSMENT / INTERVIEW / OFFER / REJECTION: specific pipeline stages.
- RECRUITER_OUTREACH: a recruiter reaching out, not yet an application.
- JOB_ALERT: a digest/recommendation of open jobs. This is NEVER an application event.
- IRRELEVANT: anything not related to a specific job application.

Then, unless the category is JOB_ALERT or IRRELEVANT, extract: company, role,
applicationDate (ISO YYYY-MM-DD), status (one of ${STATUSES.join(", ")}), and
atsIdentifier (a job/requisition/candidate ID if present). Return null for any
field you cannot find with confidence — never guess or invent a value.

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
