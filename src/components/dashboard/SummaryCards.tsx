const CARD_STYLES = "rounded-xl border border-slate-200 bg-white p-4";

export function SummaryCards({
  total,
  active,
  interviews,
  followUpsDue,
  needsReview,
}: {
  total: number;
  active: number;
  interviews: number;
  followUpsDue: number;
  needsReview: number;
}) {
  const cards = [
    { label: "Total applications", value: total, hint: needsReview > 0 ? `+${needsReview} awaiting review` : null },
    { label: "Active applications", value: active, hint: null },
    { label: "Interviews", value: interviews, hint: null },
    { label: "Follow-ups due", value: followUpsDue, hint: "Next step due or no update in 30 days" },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className={CARD_STYLES}>
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
          {c.hint && <p className="mt-0.5 text-xs text-slate-400">{c.hint}</p>}
        </div>
      ))}
    </div>
  );
}
