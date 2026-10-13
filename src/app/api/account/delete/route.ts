import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { deleteUserAccount } from "@/lib/accountData";

/** Permanently deletes the signed-in user and everything stored for them. */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await deleteUserAccount(session.user.id);
  return NextResponse.json({ ok: true });
}
