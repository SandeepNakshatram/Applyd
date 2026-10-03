import { describe, expect, it } from "vitest";
import { companyFromSenderDomain, postProcessExtraction } from "@/lib/ai/postprocess";
import { describeApplication, displayRole } from "@/lib/placeholders";
import { detectSource } from "@/lib/ai/sourceDetector";
import type { ExtractionResult } from "@/types/pipeline";
import { mockEmails } from "./fixtures/mockEmails";

const base: ExtractionResult = {
  company: "Acme",
  role: "Engineer",
  applicationDate: null,
  source: "OTHER",
  status: "APPLIED",
  eventType: "APPLICATION_CONFIRMATION",
  confidence: 0.9,
  atsIdentifier: null,
};

describe("company from the sender's domain", () => {
  it("names the employer for a corporate sender", () => {
    expect(companyFromSenderDomain("infosys.com")).toBe("Infosys");
    expect(companyFromSenderDomain("mail.razorpay.com")).toBe("Razorpay");
    expect(companyFromSenderDomain("tcs.co.in")).toBe("Tcs");
  });

  it("never names a job board, ATS or mail provider as the employer", () => {
    for (const d of ["us.greenhouse-mail.io", "jobs.lever.co", "foundit.in", "linkedin.com", "gmail.com", "myworkdayjobs.com"]) {
      expect(companyFromSenderDomain(d), d).toBeNull();
    }
  });

  it("treats greenhouse-mail.io as an ATS (company site), not 'Other'", () => {
    expect(detectSource(mockEmails.greenhouseConfirmation)).toBe("COMPANY_WEBSITE");
  });
});

describe("implausible extractions are rejected, from any engine", () => {
  const email = mockEmails.infosysIncompleteApplication;

  it("drops a sentence used as a role and lowers confidence", () => {
    const out = postProcessExtraction(email, {
      ...base,
      company: "the earliest",
      role: "the role of Technology Analyst. As per our records, your application is incomplete. Please log in to Infosys Careers",
    });
    expect(out.role).toBeNull();
    expect(out.confidence).toBeLessThanOrEqual(0.6);
  });

  it("keeps abbreviations and punctuation that are legitimately part of a name", () => {
    const out = postProcessExtraction(email, { ...base, company: "Acme Inc.", role: "Sr. Node.js Developer (.NET)" });
    expect(out.company).toBe("Acme Inc.");
    expect(out.role).toBe("Sr. Node.js Developer (.NET)");
    expect(out.confidence).toBe(0.9);
  });

  it("flags a company it had to guess, and won't trust it without corroboration", () => {
    const out = postProcessExtraction(email, { ...base, company: null, role: null, atsIdentifier: null, confidence: 0.9 });
    expect(out.company).toBe("Infosys");
    expect(out.companyInferred).toBe(true);
    expect(out.confidence).toBeLessThan(0.75);
  });

  it("trusts a guessed company just enough to attach when an id corroborates it", () => {
    const out = postProcessExtraction(email, { ...base, company: null, role: null, atsIdentifier: "1004334000", confidence: 0.5 });
    expect(out.companyInferred).toBe(true);
    expect(out.confidence).toBe(0.75);
  });
});

describe("placeholder display", () => {
  it("never shows the raw placeholder", () => {
    expect(displayRole("Unknown role")).toBe("Role not specified");
    expect(describeApplication("Schrödinger", "Unknown role")).toBe("Schrödinger");
    expect(describeApplication("Schrödinger", "Python Developer")).toBe("Schrödinger — Python Developer");
  });
});

describe("company names that differ only in legal suffix, accents or punctuation are the same company", () => {
  it("folds Limited / Pvt Ltd / Inc, case, accents and punctuation", async () => {
    const { sameCompany, companyKey } = await import("@/lib/companyKey");
    expect(sameCompany("Infosys", "Infosys Limited")).toBe(true);
    expect(sameCompany("Vinovaai Private Limited", "vinovaai")).toBe(true);
    expect(sameCompany("Schrödinger", "Schrodinger, Inc.")).toBe(true);
    expect(sameCompany("Tata Consultancy Services (TCS)", "tata consultancy services tcs")).toBe(true);
    expect(companyKey("Acme & Sons Pvt. Ltd.")).toBe("acme and sons");
  });

  it("keeps genuinely different companies apart", async () => {
    const { sameCompany } = await import("@/lib/companyKey");
    expect(sameCompany("Infosys", "Infosys BPM")).toBe(false);
    expect(sameCompany("Tata Motors", "Tata Steel")).toBe(false);
    expect(sameCompany("", "")).toBe(false);
  });
});
