import type { ApplicationStatus } from "@/generated/prisma";

/** An application in one of these stages is still "live" and expected to move. */
export const ACTIVE_STATUSES: ApplicationStatus[] = ["APPLIED", "SCREENING", "ASSESSMENT", "INTERVIEW"];

export const STALE_AFTER_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type DateLike = Date | string;

export interface FollowUpFields {
  currentStatus: ApplicationStatus;
  nextActionDate: DateLike | null;
  appliedAt: DateLike | null;
  createdAt: DateLike;
  /** Timestamp of the newest event, when the caller loaded it. */
  lastEventAt?: DateLike | null;
}

/** The last time anything happened: newest email, else the applied date, else when we first saw it. */
export function lastActivityAt(app: FollowUpFields): Date {
  return new Date(app.lastEventAt ?? app.appliedAt ?? app.createdAt);
}

export function daysSinceActivity(app: FollowUpFields, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - lastActivityAt(app).getTime()) / DAY_MS));
}

export function isStale(app: FollowUpFields, now: Date = new Date()): boolean {
  return ACTIVE_STATUSES.includes(app.currentStatus) && daysSinceActivity(app, now) >= STALE_AFTER_DAYS;
}

export function isActionOverdue(app: FollowUpFields, now: Date = new Date()): boolean {
  return (
    ACTIVE_STATUSES.includes(app.currentStatus) &&
    app.nextActionDate != null &&
    new Date(app.nextActionDate).getTime() <= now.getTime()
  );
}

/** Why a follow-up is due, or null if none is. */
export function followUpReason(app: FollowUpFields, now: Date = new Date()): string | null {
  if (isActionOverdue(app, now)) return "A next step is due";
  if (isStale(app, now)) return `No update in ${daysSinceActivity(app, now)} days`;
  return null;
}

export function isFollowUpDue(app: FollowUpFields, now: Date = new Date()): boolean {
  return followUpReason(app, now) !== null;
}
