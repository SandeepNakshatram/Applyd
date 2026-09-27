import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { manualApplicationSchema } from "@/lib/validation";
import { createManualApplication } from "@/lib/pipeline/manual";
import { buildApplicationWhere } from "@/lib/applicationsQuery";
import type { ApplicationSource, ApplicationStatus, ReviewState } from "@/generated/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const where = buildApplicationWhere(session.user.id, {
    q: searchParams.get("q"),
    status: searchParams.get("status") as ApplicationStatus | null,
    source: searchParams.get("source") as ApplicationSource | null,
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    reviewState: searchParams.get("reviewState") as ReviewState | null,
  });

  const applications = await prisma.application.findMany({
    where,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ applications });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = manualApplicationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const application = await createManualApplication(session.user.id, parsed.data);
  return NextResponse.json({ application }, { status: 201 });
}
