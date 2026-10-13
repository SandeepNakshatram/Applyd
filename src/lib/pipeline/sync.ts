import "server-only";
import type { ConnectedAccount } from "@/generated/prisma";
import { prisma } from "@/lib/prisma";
import { getProviderForAccount } from "@/lib/email/getProviderForAccount";
import { followUpReason, ACTIVE_STATUSES } from "@/lib/followUps";
import { processIncrementalSync } from "./scan";
import { notifyFollowUpDue } from "./notifications";

/** Opportunistic syncs (triggered by someone opening the app) run at most this often. */
export const OPPORTUNISTIC_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** Don't re-nag about the same application's follow-up more often than this. */
const FOLLOW_UP_REMINDER_GAP_MS = 14 * 24 * 60 * 60 * 1000;

export type SyncOutcome =
  | { status: "synced"; newEmails: number; notificationsCreated: number }
  | { status: "skipped" }
  | { status: "failed"; error: string };

/**
 * Syncs one mailbox. Unless `force` is set, it is skipped when an attempt was
 * made within `minIntervalMs`; the claim is an atomic conditional update so
 * concurrent page loads and the cron job can't run the same sync twice.
 */
export async function syncAccount(
  account: ConnectedAccount,
  options: { minIntervalMs?: number; force?: boolean } = {}
): Promise<SyncOutcome> {
  const minIntervalMs = options.minIntervalMs ?? 0;
  if (!options.force && minIntervalMs > 0) {
    const cutoff = new Date(Date.now() - minIntervalMs);
    const claimed = await prisma.connectedAccount.updateMany({
      where: {
        id: account.id,
        status: "ACTIVE",
        OR: [{ lastSyncAttemptAt: null }, { lastSyncAttemptAt: { lt: cutoff } }],
      },
      data: { lastSyncAttemptAt: new Date() },
    });
    if (claimed.count === 0) return { status: "skipped" };
  }

  try {
    const provider = await getProviderForAccount(account);
    const result = await processIncrementalSync({
      userId: account.userId,
      connectedAccountId: account.id,
      provider,
      sinceDate: account.lastSyncedAt,
    });
    return { status: "synced", ...result };
  } catch (err) {
    // processIncrementalSync has already recorded lastSyncError on the account.
    return { status: "failed", error: err instanceof Error ? err.message : "sync failed" };
  }
}

/**
 * Fire-and-forget refresh used when someone opens the app (run via `after()`
 * on the server, so it never blocks rendering and isn't client-side polling).
 * Throttled, so many page loads still cost at most one sync per interval. This
 * is what keeps data fresh between the daily scheduled runs.
 */
export async function syncUserIfDue(userId: string): Promise<void> {
  try {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
    });
    // A brand-new connection is still running its initial scan.
    if (!account || !account.lastSyncedAt) return;

    const outcome = await syncAccount(account, { minIntervalMs: OPPORTUNISTIC_SYNC_INTERVAL_MS });
    if (outcome.status === "synced") await createFollowUpReminders(userId);
  } catch (err) {
    console.error("[sync] background sync failed:", err instanceof Error ? err.message : err);
  }
}

/**
 * Creates FOLLOW_UP_DUE notifications for applications whose next step is due or
 * that have gone quiet for a month. De-duplicated per application so a stale
 * application produces one reminder, not one per sync.
 */
export async function createFollowUpReminders(userId?: string, now: Date = new Date()): Promise<number> {
  const applications = await prisma.application.findMany({
    where: {
      ...(userId ? { userId } : {}),
      reviewState: { in: ["NONE", "CONFIRMED"] },
      currentStatus: { in: ACTIVE_STATUSES },
    },
    include: { events: { orderBy: { timestamp: "desc" }, take: 1, select: { timestamp: true } } },
  });

  let created = 0;
  for (const app of applications) {
    const reason = followUpReason({ ...app, lastEventAt: app.events[0]?.timestamp ?? null }, now);
    if (!reason) continue;

    const recent = await prisma.notification.findFirst({
      where: {
        applicationId: app.id,
        type: "FOLLOW_UP_DUE",
        createdAt: { gt: new Date(now.getTime() - FOLLOW_UP_REMINDER_GAP_MS) },
      },
      select: { id: true },
    });
    if (recent) continue;

    await notifyFollowUpDue(app.userId, app, reason);
    created += 1;
  }
  return created;
}
