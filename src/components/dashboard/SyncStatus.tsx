import { formatDistanceToNow } from "date-fns";

/**
 * How fresh the data is, and — when the last sync failed — why. Replaces a bare
 * "automatically kept up to date" promise with something checkable.
 */
export function SyncStatus({
  lastSyncedAt,
  lastSyncError,
}: {
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
}) {
  return (
    <p className="mt-1 text-xs text-slate-400">
      {lastSyncedAt
        ? `Inbox checked ${formatDistanceToNow(lastSyncedAt, { addSuffix: true })}`
        : "First inbox scan in progress"}
      {lastSyncError && <span className="ml-2 font-medium text-red-600">Last sync failed: {lastSyncError}</span>}
    </p>
  );
}
