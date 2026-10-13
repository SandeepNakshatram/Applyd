import type { ApplicationSource, ApplicationStatus, Prisma, ReviewState } from "@/generated/prisma";

export interface ApplicationFilters {
  q?: string | null;
  status?: ApplicationStatus | null;
  source?: ApplicationSource | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  reviewState?: ReviewState | null;
}

export function buildApplicationWhere(
  userId: string,
  filters: ApplicationFilters
): Prisma.ApplicationWhereInput {
  const { q, status, source, dateFrom, dateTo, reviewState } = filters;

  return {
    userId,
    ...(status ? { currentStatus: status } : {}),
    ...(source ? { source } : {}),
    ...(reviewState ? { reviewState } : {}),
    ...(q
      ? {
          OR: [
            { company: { contains: q, mode: "insensitive" } },
            { role: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(dateFrom || dateTo
      ? {
          appliedAt: {
            ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
            // "To" is inclusive of the whole chosen day.
            ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999Z`) } : {}),
          },
        }
      : {}),
  };
}

export const SORT_OPTIONS = [
  { value: "recent", label: "Recently updated" },
  { value: "applied_desc", label: "Applied: newest first" },
  { value: "applied_asc", label: "Applied: oldest first" },
  { value: "company", label: "Company A–Z" },
  { value: "status", label: "Status" },
] as const;

export type SortKey = (typeof SORT_OPTIONS)[number]["value"];

export function buildApplicationOrderBy(
  sort: string | null | undefined
): Prisma.ApplicationOrderByWithRelationInput[] {
  switch (sort) {
    case "applied_desc":
      return [{ appliedAt: { sort: "desc", nulls: "last" } }, { updatedAt: "desc" }];
    case "applied_asc":
      return [{ appliedAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }];
    case "company":
      return [{ company: "asc" }, { updatedAt: "desc" }];
    case "status":
      return [{ currentStatus: "asc" }, { updatedAt: "desc" }];
    default:
      return [{ updatedAt: "desc" }];
  }
}
