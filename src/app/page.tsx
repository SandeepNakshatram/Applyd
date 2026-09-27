import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ConnectGmailButton, AddManuallyButton } from "@/components/auth/ConnectButtons";

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-gradient-to-b from-white to-slate-50 px-6 py-16">
      <div className="w-full max-w-xl text-center">
        <div className="mb-8 text-lg font-semibold tracking-tight text-slate-900">Applyd</div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
          Track every job application automatically.
        </h1>
        <p className="mt-4 text-base text-slate-600">
          Connect your inbox and we&apos;ll find the applications you&apos;ve already submitted.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <ConnectGmailButton />
          <AddManuallyButton />
        </div>

        <p className="mt-6 text-xs text-slate-400">
          We only request read-only access to Gmail and never see or ask for your password.
        </p>

        <div className="mt-16 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
          <Feature
            title="Finds applications for you"
            body="LinkedIn, Naukri, ATS confirmations, and referrals — Applyd reads the confirmations you already got."
          />
          <Feature
            title="Keeps status current"
            body="New emails about screening, interviews, offers, or rejections update the right application automatically."
          />
          <Feature
            title="Notifies you in-app"
            body="No extra emails from us. Just a notification bell when something meaningful changes."
          />
        </div>
      </div>
    </div>
  );
}

function Feature({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{body}</p>
    </div>
  );
}
