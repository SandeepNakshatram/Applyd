import { describe, expect, it } from "vitest";
import { followUpReason, isFollowUpDue, isStale, daysSinceActivity, STALE_AFTER_DAYS } from "@/lib/followUps";
import { buildApplicationOrderBy, buildApplicationWhere } from "@/lib/applicationsQuery";
import { pluralize } from "@/lib/labels";

const now = new Date("2026-10-13T12:00:00Z");
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000);

const app = (over: Partial<Parameters<typeof isStale>[0]> = {}) => ({
  currentStatus: "INTERVIEW" as const,
  nextActionDate: null,
  appliedAt: daysAgo(90),
  createdAt: daysAgo(90),
  lastEventAt: daysAgo(100),
  ...over,
});

describe("stale applications", () => {
  it("flags an active application with no update for 30+ days", () => {
    expect(isStale(app(), now)).toBe(true);
    expect(followUpReason(app(), now)).toBe("No update in 100 days");
  });

  it("does not flag a recently active one", () => {
    expect(isStale(app({ lastEventAt: daysAgo(STALE_AFTER_DAYS - 1) }), now)).toBe(false);
  });

  it("never flags finished applications", () => {
    for (const currentStatus of ["REJECTED", "OFFER", "WITHDRAWN"] as const) {
      expect(isFollowUpDue(app({ currentStatus }), now)).toBe(false);
    }
  });

  it("falls back to the applied date, then creation date, when there are no events", () => {
    expect(daysSinceActivity(app({ lastEventAt: null, appliedAt: daysAgo(5) }), now)).toBe(5);
    expect(daysSinceActivity(app({ lastEventAt: null, appliedAt: null, createdAt: daysAgo(7) }), now)).toBe(7);
  });
});

describe("overdue next steps", () => {
  it("is due when the next-action date has passed, even if recently active", () => {
    const a = app({ lastEventAt: daysAgo(1), nextActionDate: daysAgo(1) });
    expect(followUpReason(a, now)).toBe("A next step is due");
  });

  it("is not due when the next-action date is in the future", () => {
    const a = app({ lastEventAt: daysAgo(1), nextActionDate: new Date(now.getTime() + 86_400_000) });
    expect(isFollowUpDue(a, now)).toBe(false);
  });
});

describe("list helpers", () => {
  it("makes the 'to' date inclusive of the whole day", () => {
    const where = buildApplicationWhere("u1", { dateTo: "2026-10-05" });
    expect((where.appliedAt as { lte: Date }).lte.toISOString()).toBe("2026-10-05T23:59:59.999Z");
  });

  it("maps sort keys and defaults to most recently updated", () => {
    expect(buildApplicationOrderBy(undefined)).toEqual([{ updatedAt: "desc" }]);
    expect(buildApplicationOrderBy("company")[0]).toEqual({ company: "asc" });
    expect(buildApplicationOrderBy("nonsense")).toEqual([{ updatedAt: "desc" }]);
  });

  it("pluralizes", () => {
    expect(pluralize(1, "application")).toBe("application");
    expect(pluralize(2, "application")).toBe("applications");
  });
});
