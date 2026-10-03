import { isUnknownCompany, isUnknownRole } from "@/lib/placeholders";

/** Below this an extraction is treated as uncertain — mirrors REVIEW_CONFIDENCE_THRESHOLD in the resolver. */
const THRESHOLD = 0.75;

/**
 * Plain-language answer to "why is this in my Review Queue?". A bare
 * "Confidence: 100%" next to a Review card contradicts itself; the real reason
 * is almost always something specific.
 */
export function reviewReason(
  application: { company: string; role: string; confidence: number },
  latestEventData: unknown
): string {
  if (isUnknownCompany(application.company)) {
    return "We couldn't tell which company this is from the email.";
  }
  const inferred =
    latestEventData && typeof latestEventData === "object" && (latestEventData as { companyInferred?: unknown }).companyInferred === true;
  if (inferred) {
    return `The email doesn't name the company, so we guessed "${application.company}" from the sender's address. Is that right?`;
  }
  if (application.confidence < THRESHOLD) {
    return `We're only ${Math.round(application.confidence * 100)}% sure we read this one correctly.`;
  }
  if (isUnknownRole(application.role)) {
    return "The email doesn't say which role you applied for.";
  }
  return "Please take a quick look to confirm this is right.";
}
