import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layout/AppShell";
import { ApplicationDetail } from "@/components/applications/ApplicationDetail";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: { events: { orderBy: { timestamp: "asc" } } },
  });

  if (!application || application.userId !== session.user.id) notFound();

  return (
    <AppShell userName={session.user.name} userImage={session.user.image}>
      <ApplicationDetail application={application} events={application.events} />
    </AppShell>
  );
}
