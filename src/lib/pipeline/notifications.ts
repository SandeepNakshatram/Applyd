import "server-only";
import type { Application, EmailEventType, Notification, NotificationType } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { describeApplication } from "@/lib/placeholders";

const EVENT_TITLES: Partial<Record<EmailEventType, string>> = {
  APPLICATION_CONFIRMATION: "New application found",
  SCREENING: "Moved to Screening",
  ASSESSMENT: "Assessment received",
  INTERVIEW: "Interview invitation",
  OFFER: "Offer received",
  REJECTION: "Application rejected",
  APPLICATION_STATUS_UPDATE: "Application updated",
  RECRUITER_OUTREACH: "Recruiter reached out",
};

export async function createNotification(params: {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  applicationId?: string;
}): Promise<Notification> {
  return prisma.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      applicationId: params.applicationId,
    },
  });
}

export async function notifyNewApplication(
  userId: string,
  application: Application,
  eventType?: EmailEventType
): Promise<Notification> {
  // When the first mail we find about an application is already a later stage
  // (an interview invite, a rejection...), say that — "New application found"
  // would bury the part that matters.
  const staged =
    eventType && eventType !== "APPLICATION_CONFIRMATION" && eventType !== "APPLICATION_STATUS_UPDATE"
      ? EVENT_TITLES[eventType]
      : undefined;
  return createNotification({
    userId,
    type: "NEW_APPLICATION",
    title: staged ?? "New application found",
    message: describeApplication(application.company, application.role),
    applicationId: application.id,
  });
}

export async function notifyStatusChange(
  userId: string,
  application: Application,
  eventType: EmailEventType
): Promise<Notification> {
  return createNotification({
    userId,
    type: "STATUS_CHANGE",
    title: EVENT_TITLES[eventType] ?? "Application updated",
    message: describeApplication(application.company, application.role),
    applicationId: application.id,
  });
}

export async function notifyReviewNeeded(
  userId: string,
  application: Application
): Promise<Notification> {
  return createNotification({
    userId,
    type: "REVIEW_NEEDED",
    title: "Needs your review",
    message: describeApplication(application.company, application.role),
    applicationId: application.id,
  });
}

export async function notifyFollowUpDue(
  userId: string,
  application: Application,
  reason?: string
): Promise<Notification> {
  const subject = describeApplication(application.company, application.role);
  return createNotification({
    userId,
    type: "FOLLOW_UP_DUE",
    title: "Follow-up due",
    message: reason ? `${subject} — ${reason.charAt(0).toLowerCase()}${reason.slice(1)}` : subject,
    applicationId: application.id,
  });
}
