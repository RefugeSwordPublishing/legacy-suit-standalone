import { ANNUAL_SAVING_PCT } from '@/lib/pricing';

// Monthly vs annual switch, shown wherever a plan can be bought. Monthly stays the default so the
// cheaper commitment is what someone lands on without choosing.
export default function BillingIntervalToggle({ value, onChange, disabled }) {
  const opt = (interval, label) => {
    const active = value === interval;
    return (
      <button
        type="button"
        onClick={() => onChange(interval)}
        disabled={disabled}
        aria-pressed={active}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
          active ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/40 self-start">
      {opt('month', 'Monthly')}
      {opt('year', `Annual (save ${ANNUAL_SAVING_PCT}%)`)}
    </div>
  );
}
