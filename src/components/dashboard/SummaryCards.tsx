const CARD_STYLES = "rounded-xl border border-slate-200 bg-white p-4";

export function SummaryCards({
  total,
  active,
  interviews,
  followUpsDue,
}: {
  total: number;
  active: number;
  interviews: number;
  followUpsDue: number;
}) {
  const cards = [
    { label: "Total applications", value: total },
    { label: "Active applications", value: active },
    { label: "Interviews", value: interviews },
    { label: "Follow-ups due", value: followUpsDue },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className={CARD_STYLES}>
          <p className="text-xs font-medium text-slate-500">{c.label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{c.value}</p>
        </div>
      ))}
    </div>
  );
}
