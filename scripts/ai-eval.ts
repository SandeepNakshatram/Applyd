import "dotenv/config";
import { GeminiClient } from "../src/lib/ai/geminiClient";
import { postProcessExtraction } from "../src/lib/ai/postprocess";
import { mockEmails } from "../test/fixtures/mockEmails";

/**
 * Live check of the real Gemini pipeline against realistic emails (including the
 * shapes that earlier versions got wrong). Costs ~1 model call per non-trivial
 * email. Run with:  npm run ai:eval
 */

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey.startsWith("replace-with")) {
  console.error("GEMINI_API_KEY is not configured in .env");
  process.exit(1);
}
const client = new GeminiClient(apiKey, process.env.GEMINI_MODEL || "gemini-flash-lite-latest");

interface Case {
  name: string;
  email: (typeof mockEmails)[keyof typeof mockEmails];
  expect: Partial<{
    eventType: string;
    company: string | null;
    role: string | null;
    status: string | null;
    atsIdentifier: string | null;
  }>;
}

const cases: Case[] = [
  { name: "Infosys: incomplete application", email: mockEmails.infosysIncompleteApplication,
    expect: { eventType: "APPLICATION_CONFIRMATION", company: "Infosys", role: "Technology Analyst", status: "APPLIED" } },
  { name: "Infosys: interview invite (no role stated)", email: mockEmails.infosysInterviewInvite,
    expect: { eventType: "INTERVIEW", company: "Infosys", role: null, status: "INTERVIEW", atsIdentifier: "1004334000" } },
  { name: "School admissions (not a job)", email: mockEmails.mesaAdmissions, expect: { eventType: "IRRELEVANT" } },
  { name: "Job-board ad ('invited to apply')", email: mockEmails.founditJobAd, expect: { eventType: "JOB_ALERT" } },
  { name: "Recruiter outreach (not applied)", email: mockEmails.recruiterOutreach, expect: { eventType: "RECRUITER_OUTREACH" } },
  { name: "LinkedIn confirmation", email: mockEmails.linkedinConfirmation,
    expect: { eventType: "APPLICATION_CONFIRMATION", company: "Razorpay", role: "Product Manager", status: "APPLIED" } },
  { name: "Assessment (ATS id)", email: mockEmails.assessmentEmail,
    expect: { eventType: "ASSESSMENT", company: "Microsoft", role: "Product Manager", status: "ASSESSMENT", atsIdentifier: "MS-88213" } },
  { name: "Rejection", email: mockEmails.rejection,
    expect: { eventType: "REJECTION", company: "PhonePe", role: "Backend Engineer", status: "REJECTED" } },
];

const norm = (v: unknown) => (typeof v === "string" ? v.trim().toLowerCase() : v);

async function main(): Promise<number> {
let failures = 0;
for (const c of cases) {
  const classification = await client.classifyEmail(c.email);
  const raw = await client.extractApplication(c.email, classification);
  const extraction = postProcessExtraction(c.email, raw);

  const actual = { ...extraction, eventType: classification.eventType };
  const problems = Object.entries(c.expect)
    .filter(([key, want]) => norm((actual as Record<string, unknown>)[key]) !== norm(want))
    .map(([key, want]) => `${key}: expected ${JSON.stringify(want)}, got ${JSON.stringify((actual as Record<string, unknown>)[key])}`);

  const ok = problems.length === 0;
  if (!ok) failures += 1;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}  [${classification.engine}]  ` +
      `${classification.eventType} | ${extraction.company ?? "-"} | ${extraction.role ?? "-"} | ${extraction.status ?? "-"} | conf ${extraction.confidence.toFixed(2)}`
  );
  for (const p of problems) console.log(`        ${p}`);
}

console.log(`\n${cases.length - failures}/${cases.length} passed`);
return failures === 0 ? 0 : 1;
}

main().then((code) => process.exit(code));
