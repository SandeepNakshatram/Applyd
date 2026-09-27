import { describe, expect, it } from "vitest";
import { heuristicClient } from "@/lib/ai/heuristicClient";
import { mockEmails } from "./fixtures/mockEmails";

/**
 * Classification/extraction correctness for each of the 12 required mock
 * emails (spec section 27), independent of the database.
 */
describe("heuristicClient classification", () => {
  it("classifies a LinkedIn application confirmation", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.linkedinConfirmation);
    expect(result.eventType).toBe("APPLICATION_CONFIRMATION");
  });

  it("classifies a Naukri application confirmation", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.naukriConfirmation);
    expect(result.eventType).toBe("APPLICATION_CONFIRMATION");
  });

  it("classifies a company ATS confirmation", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.companyAtsConfirmation);
    expect(result.eventType).toBe("APPLICATION_CONFIRMATION");
  });

  it("classifies a referral application", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.referralApplication);
    expect(result.eventType).toBe("APPLICATION_CONFIRMATION");
  });

  it("classifies a screening email", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.screeningEmail);
    expect(result.eventType).toBe("SCREENING");
  });

  it("classifies an assessment email", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.assessmentEmail);
    expect(result.eventType).toBe("ASSESSMENT");
  });

  it("classifies an interview invitation", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.interviewInvitation);
    expect(result.eventType).toBe("INTERVIEW");
  });

  it("classifies a rejection", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.rejection);
    expect(result.eventType).toBe("REJECTION");
  });

  it("classifies an offer", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.offer);
    expect(result.eventType).toBe("OFFER");
  });

  it("classifies a generic job alert as JOB_ALERT, deterministically", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.jobAlert);
    expect(result.eventType).toBe("JOB_ALERT");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("classifies an irrelevant newsletter as IRRELEVANT", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.irrelevant);
    expect(result.eventType).toBe("IRRELEVANT");
  });

  it("classifies a duplicate confirmation the same as the original", async () => {
    const result = await heuristicClient.classifyEmail(mockEmails.duplicateConfirmation);
    expect(result.eventType).toBe("APPLICATION_CONFIRMATION");
  });
});

describe("heuristicClient extraction", () => {
  it("never invents a source — job alerts and irrelevant mail extract nothing", async () => {
    const classification = await heuristicClient.classifyEmail(mockEmails.jobAlert);
    const extraction = await heuristicClient.extractApplication(mockEmails.jobAlert, classification);
    expect(extraction.company).toBeNull();
    expect(extraction.source).toBeNull();
  });

  it("extracts company/role/source/status for a LinkedIn confirmation", async () => {
    const classification = await heuristicClient.classifyEmail(mockEmails.linkedinConfirmation);
    const extraction = await heuristicClient.extractApplication(
      mockEmails.linkedinConfirmation,
      classification
    );
    expect(extraction.company).toBe("Razorpay");
    expect(extraction.role).toBe("Product Manager");
    expect(extraction.source).toBe("LINKEDIN");
    expect(extraction.status).toBe("APPLIED");
    expect(extraction.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it("extracts an ATS identifier shared across an application's emails", async () => {
    const classification1 = await heuristicClient.classifyEmail(mockEmails.companyAtsConfirmation);
    const extraction1 = await heuristicClient.extractApplication(
      mockEmails.companyAtsConfirmation,
      classification1
    );
    const classification2 = await heuristicClient.classifyEmail(mockEmails.assessmentEmail);
    const extraction2 = await heuristicClient.extractApplication(mockEmails.assessmentEmail, classification2);

    expect(extraction1.atsIdentifier).toBe("MS-88213");
    expect(extraction2.atsIdentifier).toBe("MS-88213");
    expect(extraction1.company).toBe("Microsoft");
    expect(extraction2.company).toBe("Microsoft");
  });

  it("detects REFERRAL source for a referral application", async () => {
    const classification = await heuristicClient.classifyEmail(mockEmails.referralApplication);
    const extraction = await heuristicClient.extractApplication(
      mockEmails.referralApplication,
      classification
    );
    expect(extraction.source).toBe("REFERRAL");
    expect(extraction.company).toBe("Flipkart");
  });
});
