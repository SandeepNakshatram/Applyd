import type { EmailEventType } from "@/generated/prisma";
import type { ExtractionResult, RawEmail } from "@/types/pipeline";
import { ATS_DOMAINS, JOB_BOARD_DOMAINS, MAIL_PROVIDER_DOMAINS, domainMatches } from "@/lib/jobDomains";

/**
 * Last-line defences applied to every extraction regardless of which engine
 * produced it (spec section 7: never hallucinate — if a value isn't credible,
 * return null and let the Review Queue handle it).
 */

const MAX_COMPANY_CHARS = 80;
const MAX_COMPANY_WORDS = 8;
const MAX_ROLE_CHARS = 120;
const MAX_ROLE_WORDS = 18;

/** Anything shaped like a sentence is a bad capture, not a name. */
function looksLikeSentence(value: string): boolean {
  // Abbreviation periods ("Sr. Engineer", "Acme Inc.") aren't sentence ends.
  const v = value.replace(/\b(Sr|Jr|Inc|Ltd|Pvt|LLC|Co|Corp|Dr|Mr|Ms|St)\./gi, "$1");
  return /[.!?]\s+[A-Za-z]/.test(v) || /[.!?]$/.test(v);
}

function credible(value: string | null, maxChars: number, maxWords: number): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v || v.length > maxChars) return null;
  if (v.split(/\s+/).length > maxWords) return null;
  if (looksLikeSentence(v)) return null;
  return v;
}

/** Domains that say nothing about the employer (job boards, ATS vendors, mail providers). */
const NON_EMPLOYER_DOMAINS = [...ATS_DOMAINS, ...JOB_BOARD_DOMAINS, ...MAIL_PROVIDER_DOMAINS];

const SECOND_LEVEL_TLDS = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/** "talent-acquisition@mail.infosys.com" -> "Infosys"; null for job boards / mail providers. */
export function companyFromSenderDomain(fromDomain: string): string | null {
  const domain = fromDomain.toLowerCase().trim();
  if (!domain) return null;
  const parts = domain.split(".");
  if (parts.length < 2) return null;

  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];
  const label = tld.length === 2 && SECOND_LEVEL_TLDS.has(sld) && parts.length >= 3 ? parts[parts.length - 3] : sld;
  if (domainMatches(domain, NON_EMPLOYER_DOMAINS)) return null;
  if (!/^[a-z0-9-]{2,}$/.test(label)) return null;

  return label
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

const COMPANY_HINT_EVENT_TYPES: ReadonlySet<EmailEventType> = new Set([
  "APPLICATION_CONFIRMATION",
  "APPLICATION_STATUS_UPDATE",
  "SCREENING",
  "ASSESSMENT",
  "INTERVIEW",
  "REJECTION",
  "OFFER",
]);

/**
 * A company guessed from the sender's domain is only trusted enough to attach
 * an update to an application we already track when something else
 * corroborates it (a candidate/application id, or a stated role): that gets
 * exactly the review threshold. Uncorroborated, it stays below the threshold
 * so the item goes to the Review Queue for a human to confirm. Either way a
 * missing role still routes a *new* application to review.
 */
const DOMAIN_HINT_CORROBORATED = 0.75;
const DOMAIN_HINT_UNCORROBORATED_MAX = 0.6;

export function postProcessExtraction(email: RawEmail, extraction: ExtractionResult): ExtractionResult {
  let { company, role, confidence } = extraction;
  let companyInferred = false;

  const cleanCompany = credible(company, MAX_COMPANY_CHARS, MAX_COMPANY_WORDS);
  const cleanRole = credible(role, MAX_ROLE_CHARS, MAX_ROLE_WORDS);
  const discarded = cleanCompany !== company || cleanRole !== role;
  if (discarded) {
    // A value was thrown away as implausible — the rest of the extraction
    // deserves less trust too.
    confidence = Math.min(confidence, 0.5);
  }
  company = cleanCompany;
  role = cleanRole;

  if (!company && COMPANY_HINT_EVENT_TYPES.has(extraction.eventType)) {
    const hinted = companyFromSenderDomain(email.fromDomain);
    if (hinted) {
      company = hinted;
      companyInferred = true;
      const corroborated = !discarded && Boolean(extraction.atsIdentifier || role);
      confidence = corroborated
        ? DOMAIN_HINT_CORROBORATED
        : Math.min(Math.max(confidence, 0.5), DOMAIN_HINT_UNCORROBORATED_MAX);
    }
  }

  return { ...extraction, company, role, confidence, ...(companyInferred ? { companyInferred } : {}) };
}
