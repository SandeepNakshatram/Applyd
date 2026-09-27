import { format } from "date-fns";
import type { ApplicationEvent } from "@/generated/prisma";

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

export function ApplicationTimeline({ events }: { events: ApplicationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">No events recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-slate-200 pl-4">
      {events.map((event) => (
        <li key={event.id} className="mb-6 last:mb-0">
          <span className="absolute -left-[5px] mt-1 h-2.5 w-2.5 rounded-full bg-slate-900" />
          <p className="text-sm font-medium text-slate-900">{EVENT_LABELS[event.eventType]}</p>
          <p className="text-xs text-slate-400">{format(new Date(event.timestamp), "MMM d, yyyy p")}</p>
          {event.emailId && (
            <p className="mt-1 text-xs italic text-slate-400">Detected from email</p>
          )}
        </li>
      ))}
    </ol>
  );
}
