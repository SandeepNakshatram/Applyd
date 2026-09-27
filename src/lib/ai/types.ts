import type { ClassificationResult, ExtractionResult, RawEmail } from "@/types/pipeline";

/**
 * Everything the AI stage of the pipeline needs, behind one interface so the
 * resolver/ingest code never cares whether classification/extraction came
 * from Gemini or the deterministic fallback.
 */
export interface AIClient {
  classifyEmail(email: RawEmail): Promise<ClassificationResult>;
  extractApplication(
    email: RawEmail,
    classification: ClassificationResult
  ): Promise<ExtractionResult>;
}
