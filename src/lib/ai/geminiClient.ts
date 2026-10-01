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

/**
 * AI stage backed by Google Gemini. Both calls request strict JSON via
 * responseSchema so we never depend on parsing free-form text (spec section
 * 7). Every call is wrapped so a Gemini failure (rate limit, network, bad
 * JSON) falls back to the deterministic heuristic client rather than
 * crashing the whole ingestion run.
 */
export class GeminiClient implements AIClient {
  private client: GoogleGenerativeAI;
  private modelName: string;

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
              confidence: { type: SchemaType.NUMBER },
              reasoning: { type: SchemaType.STRING },
            },
            required: ["eventType", "confidence"],
          },
          ...NO_THINKING,
        },
      });

      const result = await model.generateContent(buildClassificationPrompt(email));
      const parsed = JSON.parse(result.response.text());
      if (!EVENT_TYPES.includes(parsed.eventType)) throw new Error("invalid eventType");
      return {
        eventType: parsed.eventType,
        confidence: clamp01(parsed.confidence),
        reasoning: parsed.reasoning,
      };
    } catch (err) {
      console.error("[GeminiClient] classifyEmail failed, falling back to heuristic:", err);
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

    try {
      const model = this.client.getGenerativeModel({
        model: this.modelName,
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: {
            type: SchemaType.OBJECT,
            properties: {
              company: { type: SchemaType.STRING, nullable: true },
              role: { type: SchemaType.STRING, nullable: true },
              applicationDate: { type: SchemaType.STRING, nullable: true },
              status: { type: SchemaType.STRING, format: "enum", enum: [...STATUSES], nullable: true },
              atsIdentifier: { type: SchemaType.STRING, nullable: true },
              confidence: { type: SchemaType.NUMBER },
            },
            required: ["confidence"],
          },
          ...NO_THINKING,
        },
      });

      const result = await model.generateContent(
        buildExtractionPrompt(email, classification.eventType)
      );
      const parsed = JSON.parse(result.response.text());

      // Source is deterministic-only, never trust the model here (spec section 8).
      const source = detectSource(email);

      return {
        company: nullableString(parsed.company),
        role: nullableString(parsed.role),
        applicationDate: nullableString(parsed.applicationDate),
        source,
        status: STATUSES.includes(parsed.status) ? parsed.status : null,
        eventType: classification.eventType,
        confidence: clamp01(parsed.confidence),
        atsIdentifier: nullableString(parsed.atsIdentifier),
      };
    } catch (err) {
      console.error("[GeminiClient] extractApplication failed, falling back to heuristic:", err);
      return heuristicClient.extractApplication(email, classification);
    }
  }
}

/**
 * Disables "thinking" mode via a config field not yet in this SDK version's
 * types (the REST API honors it regardless — verified directly). Extended
 * reasoning adds real latency and token cost we don't need for a structured
 * classify/extract call, and was part of why scans ran slower than
 * necessary.
 */
const NO_THINKING = { thinkingConfig: { thinkingBudget: 0 } } as Record<string, unknown>;

function buildClassificationPrompt(email: RawEmail): string {
  return `You classify emails for a job application tracker. Given the email below, return the single best category.

Categories: ${EVENT_TYPES.join(", ")}

Rules:
- APPLICATION_CONFIRMATION: confirms a job application was submitted.
- APPLICATION_STATUS_UPDATE: a generic status change on an existing application.
- SCREENING / ASSESSMENT / INTERVIEW / OFFER / REJECTION: specific pipeline stages.
- RECRUITER_OUTREACH: a recruiter reaching out, not yet an application.
- JOB_ALERT: a digest/recommendation of open jobs. This is NEVER an application event.
- IRRELEVANT: anything not related to a specific job application.

From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}

Respond with JSON only: {"eventType": string, "confidence": number between 0 and 1, "reasoning": short string}`;
}

function buildExtractionPrompt(email: RawEmail, eventType: EmailEventType): string {
  return `Extract structured application data from this email, already classified as ${eventType}.

Return null for any field you cannot find with confidence. Do not guess or invent values.

From: ${email.from}
Subject: ${email.subject}
Body:
${email.body}

Respond with JSON only: {
  "company": string or null,
  "role": string or null,
  "applicationDate": ISO date string (YYYY-MM-DD) or null,
  "status": one of ${STATUSES.join(", ")} or null,
  "atsIdentifier": string or null (a job/requisition/candidate ID if present),
  "confidence": number between 0 and 1 reflecting overall extraction confidence
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
