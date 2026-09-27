import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { applicationUpdateSchema } from "@/lib/validation";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const application = await prisma.application.findUnique({
    where: { id },
    include: { events: { orderBy: { timestamp: "asc" } } },
  });

  if (!application || application.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ application });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await prisma.application.findUnique({ where: { id } });
  if (!existing || existing.userId !== session.user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = applicationUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { reviewAction, appliedAt, nextActionDate, ...rest } = parsed.data;

  const application = await prisma.application.update({
    where: { id },
    data: {
      ...rest,
      ...(appliedAt !== undefined ? { appliedAt: appliedAt ? new Date(appliedAt) : null } : {}),
      ...(nextActionDate !== undefined
        ? { nextActionDate: nextActionDate ? new Date(nextActionDate) : null }
        : {}),
      ...(reviewAction === "confirm" ? { reviewState: "CONFIRMED" } : {}),
      ...(reviewAction === "ignore" ? { reviewState: "IGNORED" } : {}),
    },
  });

  return NextResponse.json({ application });
}
