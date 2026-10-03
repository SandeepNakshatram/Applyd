import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { heuristicClient } from "@/lib/ai/heuristicClient";
import { ingestEmail } from "@/lib/pipeline/ingest";
import { mockEmails } from "./fixtures/mockEmails";

/**
 * End-to-end acceptance test for the ingestion pipeline (spec sections 27/28):
 * EMAIL -> CLASSIFY -> EXTRACT -> RESOLVE -> EVENT -> STATUS UPDATE -> NOTIFY,
 * run against a real (embedded, throwaway) Postgres instance so this proves
 * the same code path a live Gmail sync would use.
 */

let userId: string;
let connectedAccountId: string;

async function ingest(email: (typeof mockEmails)[keyof typeof mockEmails]) {
  return ingestEmail({ userId, connectedAccountId, email, aiClient: heuristicClient });
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { email: "pipeline-test@example.com", name: "Pipeline Test" },
  });
  userId = user.id;

  const account = await prisma.connectedAccount.create({
    data: {
      userId,
      provider: "GMAIL",
      providerAccountId: "pipeline-test-account",
      emailAddress: "pipeline-test@example.com",
      accessTokenReference: "unused-in-tests",
      scopes: ["https://www.googleapis.com/auth/gmail.readonly"],
    },
  });
  connectedAccountId = account.id;
});

describe("job alerts and irrelevant mail", () => {
  it("never creates an application for a job alert", async () => {
    const result = await ingest(mockEmails.jobAlert);
    expect(result.outcome).toBe("IGNORED_JOB_ALERT");
    expect(result.applicationId).toBeUndefined();
  });

  it("never creates an application for irrelevant mail", async () => {
    const result = await ingest(mockEmails.irrelevant);
    expect(result.outcome).toBe("IGNORED_IRRELEVANT");
  });

  it("still recorded both as processed, so replays are inert", async () => {
    const replay = await ingest(mockEmails.jobAlert);
    expect(replay.outcome).toBe("IGNORED_ALREADY_PROCESSED");
  });
});

describe("multi-email applications resolve to one Application", () => {
  it("creates a new Razorpay application from the LinkedIn confirmation", async () => {
    const result = await ingest(mockEmails.linkedinConfirmation);
    expect(result.outcome).toBe("APPLICATION_CREATED");

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.company).toBe("Razorpay");
    expect(application.role).toBe("Product Manager");
    expect(application.source).toBe("LINKEDIN");
    expect(application.currentStatus).toBe("APPLIED");
  });

  it("attaches the screening update to the same application, no duplicate", async () => {
    const result = await ingest(mockEmails.screeningEmail);
    expect(result.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.company).toBe("Razorpay");
    expect(application.currentStatus).toBe("SCREENING");
    // Source stays LINKEDIN — a later status email from the company's own
    // domain must not overwrite where the application actually came from.
    expect(application.source).toBe("LINKEDIN");
  });

  it("attaches the interview invitation to the same application", async () => {
    const result = await ingest(mockEmails.interviewInvitation);
    expect(result.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.currentStatus).toBe("INTERVIEW");
  });

  it("ends up with exactly one Application and three ApplicationEvents for Razorpay", async () => {
    const applications = await prisma.application.findMany({
      where: { userId, company: "Razorpay" },
    });
    expect(applications).toHaveLength(1);

    const events = await prisma.applicationEvent.findMany({
      where: { applicationId: applications[0].id },
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.eventType).sort()).toEqual(
      ["APPLICATION_CONFIRMATION", "INTERVIEW", "SCREENING"].sort()
    );
  });

  it("does not add a 4th event or notification for a duplicate resend of the same status", async () => {
    const before = await prisma.applicationEvent.count({
      where: { application: { company: "Razorpay" } },
    });
    const notificationsBefore = await prisma.notification.count({ where: { userId } });

    const result = await ingest(mockEmails.duplicateConfirmation);
    expect(result.outcome).toBe("IGNORED_ALREADY_PROCESSED");

    const after = await prisma.applicationEvent.count({
      where: { application: { company: "Razorpay" } },
    });
    const notificationsAfter = await prisma.notification.count({ where: { userId } });

    expect(after).toBe(before);
    expect(notificationsAfter).toBe(notificationsBefore);
  });
});

describe("ATS identifier matching merges emails without shared wording", () => {
  it("creates the Microsoft application from the ATS confirmation", async () => {
    const result = await ingest(mockEmails.companyAtsConfirmation);
    expect(result.outcome).toBe("APPLICATION_CREATED");

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.atsIdentifier).toBe("MS-88213");
    expect(application.source).toBe("COMPANY_WEBSITE");
  });

  it("matches the assessment email to the same application via ATS id, not company/role text", async () => {
    const result = await ingest(mockEmails.assessmentEmail);
    expect(result.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");

    const applications = await prisma.application.findMany({
      where: { userId, company: "Microsoft" },
    });
    expect(applications).toHaveLength(1);
    expect(applications[0].currentStatus).toBe("ASSESSMENT");
    expect(applications[0].nextActionDate).not.toBeNull();
  });
});

describe("independent applications from other sources", () => {
  it("creates a Naukri application for TCS", async () => {
    const result = await ingest(mockEmails.naukriConfirmation);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.source).toBe("NAUKRI");
    expect(application.company).toMatch(/Tata Consultancy Services/);
  });

  it("creates a referral application for Flipkart", async () => {
    const result = await ingest(mockEmails.referralApplication);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.source).toBe("REFERRAL");
    expect(application.company).toBe("Flipkart");
  });

  it("creates a rejected PhonePe application directly from a rejection email", async () => {
    const result = await ingest(mockEmails.rejection);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.company).toBe("PhonePe");
    expect(application.currentStatus).toBe("REJECTED");
  });

  it("creates an Amazon application directly at OFFER status", async () => {
    const result = await ingest(mockEmails.offer);
    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.company).toBe("Amazon");
    expect(application.currentStatus).toBe("OFFER");
    expect(application.nextActionDate).not.toBeNull();
  });
});

describe("low-confidence extraction goes to the Review Queue", () => {
  it("flags an application it can't confidently extract instead of guessing", async () => {
    const result = await ingest(mockEmails.ambiguousApplication);
    expect(result.outcome).toBe("SENT_TO_REVIEW");

    const application = await prisma.application.findUniqueOrThrow({
      where: { id: result.applicationId },
    });
    expect(application.reviewState).toBe("PENDING");
    expect(application.confidence).toBeLessThan(0.75);
  });
});

describe("a reapplication long after the original is a new Application, not a merge", () => {
  it("creates a second Razorpay application instead of reopening the first", async () => {
    const result = await ingest(mockEmails.razorpayReapplication);
    expect(result.outcome).toBe("APPLICATION_CREATED");
    expect(result.applicationId).not.toBe(
      (await prisma.application.findFirst({ where: { userId, company: "Razorpay" }, orderBy: { createdAt: "asc" } }))!.id
    );

    const razorpayApps = await prisma.application.findMany({ where: { userId, company: "Razorpay" } });
    expect(razorpayApps).toHaveLength(2);

    const newApp = razorpayApps.find((a) => a.id === result.applicationId)!;
    expect(newApp.currentStatus).toBe("APPLIED");
    // Allow for local-timezone parsing of the extracted "Jan 15, 2027" date
    // string landing a day either side in UTC.
    expect(newApp.appliedAt).not.toBeNull();
    expect(Math.abs(newApp.appliedAt!.getTime() - new Date("2027-01-15").getTime())).toBeLessThan(
      2 * 24 * 60 * 60 * 1000
    );
  });
});

describe("real-world mail that earlier versions got wrong", () => {
  it("drops a school admissions 'application' — it isn't a job", async () => {
    const result = await ingest(mockEmails.mesaAdmissions);
    expect(result.outcome).toBe("IGNORED_IRRELEVANT");
  });

  it("drops a job-board advertisement ('you're invited to apply … great match')", async () => {
    const result = await ingest(mockEmails.founditJobAd);
    expect(result.outcome).toBe("IGNORED_JOB_ALERT");
  });

  it("does not turn unsolicited recruiter outreach into an application", async () => {
    const result = await ingest(mockEmails.recruiterOutreach);
    expect(result.outcome).toBe("IGNORED_RECRUITER_OUTREACH");
    expect(await prisma.application.count({ where: { userId, company: { contains: "Examplesoft", mode: "insensitive" } } })).toBe(0);
  });

  it("reads company from the subject and role from 'the role of X' — no sentence fragments", async () => {
    const result = await ingest(mockEmails.infosysIncompleteApplication);
    expect(result.outcome).toBe("APPLICATION_CREATED");

    const application = await prisma.application.findUniqueOrThrow({ where: { id: result.applicationId } });
    expect(application.company).toBe("Infosys");
    expect(application.role).toBe("Technology Analyst");
    expect(application.currentStatus).toBe("APPLIED");
    expect(application.reviewState).toBe("NONE");
  });

  it("attaches an interview invite that names no role to the one open Infosys application, learning its candidate id", async () => {
    const result = await ingest(mockEmails.infosysInterviewInvite);
    expect(result.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");

    const infosys = await prisma.application.findMany({ where: { userId, company: "Infosys" } });
    expect(infosys).toHaveLength(1);
    expect(infosys[0].id).toBe(result.applicationId);
    expect(infosys[0].role).toBe("Technology Analyst");
    expect(infosys[0].currentStatus).toBe("INTERVIEW");
    expect(infosys[0].atsIdentifier).toBe("1004334000");
    expect(infosys[0].reviewState).toBe("NONE");
  });
});

describe("a confirmation that names no role", () => {
  it("goes straight to the dashboard (not the review queue) as 'role not specified'", async () => {
    const result = await ingest(mockEmails.greenhouseConfirmation);
    expect(result.outcome).toBe("APPLICATION_CREATED");

    const application = await prisma.application.findUniqueOrThrow({ where: { id: result.applicationId } });
    expect(application.company).toBe("Schrödinger");
    expect(application.role).toBe("Unknown role");
    expect(application.reviewState).toBe("NONE");
    expect(application.source).toBe("COMPANY_WEBSITE");
  });

  it("learns the role when a later email finally names it, instead of creating a duplicate", async () => {
    const result = await ingest(mockEmails.schrodingerInterviewInvite);
    expect(result.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");

    const apps = await prisma.application.findMany({ where: { userId, company: "Schrödinger" } });
    expect(apps).toHaveLength(1);
    expect(apps[0].role).toBe("Software Developer - Python");
    expect(apps[0].currentStatus).toBe("INTERVIEW");
  });
});

describe("the same employer named two ways is still one application", () => {
  it("links 'Globex Private Limited' and 'Globex' instead of creating a duplicate", async () => {
    const first = await ingest(mockEmails.globexConfirmation);
    expect(first.outcome).toBe("APPLICATION_CREATED");
    const created = await prisma.application.findUniqueOrThrow({ where: { id: first.applicationId } });
    expect(created.company).toBe("Globex Private Limited");

    const second = await ingest(mockEmails.globexInterview);
    expect(second.outcome).toBe("EVENT_ADDED_WITH_NOTIFICATION");
    expect(second.applicationId).toBe(first.applicationId);

    expect(await prisma.application.count({ where: { userId, company: { startsWith: "Globex" } } })).toBe(1);
  });
});

describe("notifications", () => {
  it("created a NEW_APPLICATION notification for each newly discovered application", async () => {
    const count = await prisma.notification.count({ where: { userId, type: "NEW_APPLICATION" } });
    // Razorpay, Microsoft, TCS, Flipkart, PhonePe, Amazon, Razorpay-reapplication, Infosys, Schrödinger, Globex = 10.
    expect(count).toBe(10);
  });

  it("created STATUS_CHANGE notifications for the screening/assessment/interview updates", async () => {
    const count = await prisma.notification.count({ where: { userId, type: "STATUS_CHANGE" } });
    expect(count).toBe(6); // Razorpay screening + interview, Microsoft assessment, Infosys/Schrödinger/Globex interviews.
  });

  it("created a REVIEW_NEEDED notification for the ambiguous application", async () => {
    const count = await prisma.notification.count({ where: { userId, type: "REVIEW_NEEDED" } });
    expect(count).toBe(1);
  });

  it("never created a notification for the job alert, irrelevant mail, or the duplicate", async () => {
    const total = await prisma.notification.count({ where: { userId } });
    expect(total).toBe(10 + 6 + 1);
  });
});
