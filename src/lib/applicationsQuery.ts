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
            ...(dateTo ? { lte: new Date(dateTo) } : {}),
          },
        }
      : {}),
  };
}
