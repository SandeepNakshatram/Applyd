import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ApplicationList } from "@/components/dashboard/ApplicationList";
import { SearchBar } from "@/components/forms/SearchBar";
import { FilterBar } from "@/components/forms/FilterBar";
import { AddApplicationButton } from "@/components/forms/AddApplicationButton";
import { buildApplicationWhere } from "@/lib/applicationsQuery";
import type { ApplicationSource, ApplicationStatus } from "@/generated/prisma";

export default async function ApplicationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const params = await searchParams;

  const where = buildApplicationWhere(session.user.id, {
    q: params.q,
    status: (params.status as ApplicationStatus) || null,
    source: (params.source as ApplicationSource) || null,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    reviewState: undefined,
  });
  where.reviewState = { in: ["NONE", "CONFIRMED"] };

  const applications = await prisma.application.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Applications</h1>
          <AddApplicationButton />
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SearchBar />
          <FilterBar />
        </div>

        <ApplicationList applications={applications} />
      </div>
    </AppShell>
  );
}
