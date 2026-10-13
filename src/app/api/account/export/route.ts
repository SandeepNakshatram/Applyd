import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { exportUserData } from "@/lib/accountData";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await exportUserData(session.user.id);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="applyd-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
