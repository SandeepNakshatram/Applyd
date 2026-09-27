import "server-only";
import type { ApplicationStatus, EmailEventType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import type { ManualApplicationInput } from "@/lib/validation";

const STATUS_TO_EVENT_TYPE: Record<ApplicationStatus, EmailEventType> = {
  APPLIED: "APPLICATION_CONFIRMATION",
  SCREENING: "SCREENING",
  ASSESSMENT: "ASSESSMENT",
  INTERVIEW: "INTERVIEW",
  OFFER: "OFFER",
  REJECTED: "REJECTION",
  WITHDRAWN: "APPLICATION_STATUS_UPDATE",
};

/**
 * Manual entry is the fallback path (spec section 19). It still produces an
 * Application + one ApplicationEvent so the timeline/detail view and search
 * treat it identically to an automatically discovered application — the only
 * difference is `isManual: true` and no source email.
 */
export async function createManualApplication(userId: string, input: ManualApplicationInput) {
  const appliedAt = input.appliedAt ? new Date(input.appliedAt) : new Date();

  const application = await prisma.application.create({
    data: {
      userId,
      company: input.company,
      role: input.role,
      source: input.source,
      appliedAt,
      currentStatus: input.status,
      nextAction: input.nextAction ?? null,
      nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null,
      notes: input.notes ?? null,
      confidence: 1,
      reviewState: "NONE",
      isManual: true,
    },
  });

  await prisma.applicationEvent.create({
    data: {
      applicationId: application.id,
      eventType: STATUS_TO_EVENT_TYPE[input.status],
      status: input.status,
      timestamp: appliedAt,
      source: input.source,
      emailId: null,
      confidence: 1,
    },
  });

  return application;
}
