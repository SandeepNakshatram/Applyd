import type { ReactNode } from "react";
import { after } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { syncUserIfDue } from "@/lib/pipeline/sync";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export async function AppShell({
  children,
  userName,
  userImage,
}: {
  children: ReactNode;
  userName?: string | null;
  userImage?: string | null;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  // Nav badge: how many records are waiting for the user's confirmation.
  const reviewCount = userId
    ? await prisma.application.count({ where: { userId, reviewState: "PENDING" } })
    : 0;

  // Keep the mailbox fresh whenever the app is in use (throttled; runs after the response is sent).
  if (userId) after(() => syncUserIfDue(userId));

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar reviewCount={reviewCount} />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <TopBar userName={userName} userImage={userImage} />
        <main className="flex-1 bg-slate-50 p-6">{children}</main>
      </div>
    </div>
  );
}
