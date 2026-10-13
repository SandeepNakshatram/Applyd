import { format } from "date-fns";
import { Mail, ExternalLink } from "lucide-react";
import type { ApplicationEvent } from "@/generated/prisma";
import { gmailMessageUrl } from "@/lib/email/gmailLink";

const EVENT_LABELS: Record<ApplicationEvent["eventType"], string> = {
  APPLICATION_CONFIRMATION: "Applied",
  APPLICATION_STATUS_UPDATE: "Status update",
  SCREENING: "Screening",
  ASSESSMENT: "Assessment",
  INTERVIEW: "Interview",
  REJECTION: "Rejected",
  OFFER: "Offer",
  RECRUITER_OUTREACH: "Recruiter outreach",
  JOB_ALERT: "Job alert",
  IRRELEVANT: "Irrelevant",
};

interface SourceEmail {
  from?: string;
  subject?: string;
  snippet?: string;
}

/** The sender/subject/snippet captured at ingest time (see resolver `eventData`). */
function sourceEmailOf(event: ApplicationEvent): SourceEmail | null {
  const data = event.extractedData;
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const email = (data as Record<string, unknown>).email;
  if (!email || typeof email !== "object") return null;
  const { from, subject, snippet } = email as Record<string, unknown>;
  return {
    from: typeof from === "string" ? from : undefined,
    subject: typeof subject === "string" ? subject : undefined,
    snippet: typeof snippet === "string" ? snippet : undefined,
  };
}

export function ApplicationTimeline({ events }: { events: ApplicationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No events recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-slate-200 pl-4">
      {events.map((event) => {
        const source = sourceEmailOf(event);
        return (
          <li key={event.id} className="mb-6 last:mb-0">
            <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
            <p className="text-sm font-medium text-slate-900">{EVENT_LABELS[event.eventType]}</p>
            <p className="text-xs text-slate-500">{format(new Date(event.timestamp), "MMM d, yyyy p")}</p>

            {event.emailId ? (
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                {source?.subject && (
                  <p className="font-medium text-slate-800" title={source.subject}>
                    {source.subject}
                  </p>
                )}
                {source?.from && (
                  <p className="truncate text-slate-500" title={source.from}>
                    From {source.from}
                  </p>
                )}
                {source?.snippet && <p className="mt-1 text-slate-500">{source.snippet}…</p>}
                <a
                  href={gmailMessageUrl(event.emailId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline"
                >
                  <Mail className="h-3 w-3" />
                  Open in Gmail
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Added manually</p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
