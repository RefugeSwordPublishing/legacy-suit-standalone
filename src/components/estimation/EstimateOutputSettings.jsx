import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEFAULT_COLS = { show_qty: true, show_unit: true, show_line_total: true };
const DEFAULT_GC = { gc_fee_enabled: false, gc_fee_pct: 10, gc_fee_label: 'GC / Project Management Fee' };

export default function EstimateOutputSettings({ form, onChange }) {
  const cols = { ...DEFAULT_COLS, ...(form.column_settings || {}) };
  const gcEnabled = form.gc_fee_enabled ?? false;
  const gcPct = form.gc_fee_pct ?? 10;
  const gcLabel = form.gc_fee_label ?? DEFAULT_GC.gc_fee_label;

  const setCol = (key, val) => {
    onChange({ column_settings: { ...cols, [key]: val } });
  };

  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-4">
      <h3 className="text-sm font-semibold">Output Settings</h3>

      {/* Column visibility */}
      <div>
        <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-2">Visible Columns</p>
        <div className="space-y-2">
          {[
            { key: 'show_qty', label: 'Quantity' },
            { key: 'show_unit', label: 'Unit' },
            { key: 'show_line_total', label: 'Line Total' },
          ].map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <Label htmlFor={key} className="text-sm cursor-pointer">{label}</Label>
              <Switch
                id={key}
                checked={cols[key]}
                onCheckedChange={val => setCol(key, val)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* GC Fee */}
      <div className="border-t border-border pt-3 space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="gc_fee_enabled" className="text-sm cursor-pointer font-medium">GC / PM Fee</Label>
          <Switch
            id="gc_fee_enabled"
            checked={gcEnabled}
            onCheckedChange={val => onChange({ gc_fee_enabled: val })}
          />
        </div>
        {gcEnabled && (
          <div className="space-y-2 pl-1">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Fee Label</label>
              <Input
                value={gcLabel}
                onChange={e => onChange({ gc_fee_label: e.target.value })}
                className="h-7 text-sm"
                placeholder="GC / Project Management Fee"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Fee % of Project Total</label>
              <div className="relative w-24">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={gcPct}
                  onChange={e => onChange({ gc_fee_pct: parseFloat(e.target.value) || 0 })}
                  className="h-7 text-right pr-5 w-24"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs">%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}