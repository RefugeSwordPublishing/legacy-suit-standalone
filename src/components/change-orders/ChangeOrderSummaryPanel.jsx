import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function getAllItems(sections) {
  return (sections || []).flatMap(s => s.line_items || []);
}

export default function ChangeOrderSummaryPanel({
  sections = [],
  gcFeeEnabled,
  gcFeePct,
  gcFeeLabel,
  originalEstimateTotal,
  onGcChange,
}) {
  const items = getAllItems(sections);
  const lineTotal = items.reduce((s, i) => s + (i.line_total || 0), 0);
  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const totalMarkup = lineTotal - subtotal;
  const gcFeeAmount = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0;
  const changeOrderTotal = lineTotal + gcFeeAmount;
  const newContractTotal = (originalEstimateTotal || 0) + changeOrderTotal;

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 xl:sticky xl:top-4">
      <h3 className="text-sm font-semibold">Summary</h3>

      {/* CO Line item breakdown */}
      <div className="space-y-1.5 text-sm">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">This Change Order</p>
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span><span>${fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Markup</span><span>${fmt(totalMarkup)}</span>
        </div>
      </div>

      {/* GC Fee controls */}
      <div className="border-t border-border pt-3 space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-sm">Additional GC / PM Fee</Label>
          <Switch
            checked={gcFeeEnabled}
            onCheckedChange={v => onGcChange({ gc_fee_enabled: v })}
          />
        </div>
        {gcFeeEnabled && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Input
                type="number"
                value={gcFeePct}
                onChange={e => onGcChange({ gc_fee_pct: parseFloat(e.target.value) || 0 })}
                className="w-20 h-8 text-sm"
                min={0}
                max={100}
                step={0.5}
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
            <Input
              value={gcFeeLabel}
              onChange={e => onGcChange({ gc_fee_label: e.target.value })}
              placeholder="Fee label..."
              className="h-8 text-sm"
            />
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{gcFeeLabel || 'GC Fee'} ({gcFeePct}%)</span>
              <span>+${fmt(gcFeeAmount)}</span>
            </div>
          </div>
        )}
        <div className="flex justify-between text-sm font-semibold text-foreground border-t border-border pt-2">
          <span>CO Total</span>
          <span className={changeOrderTotal >= 0 ? '' : 'text-red-600'}>
            {changeOrderTotal >= 0 ? '+' : ''}${fmt(changeOrderTotal)}
          </span>
        </div>
      </div>

      {/* Contract totals */}
      <div className="border-t border-border pt-3 space-y-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contract</p>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Original Contract Total</span>
          <span>${fmt(originalEstimateTotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Change Order</span>
          <span className={changeOrderTotal >= 0 ? '' : 'text-red-600'}>
            {changeOrderTotal >= 0 ? '+' : ''}${fmt(changeOrderTotal)}
          </span>
        </div>
        <div className="flex justify-between text-base font-bold text-foreground border-t border-border pt-2 mt-1">
          <span>New Contract Total</span>
          <span>${fmt(newContractTotal)}</span>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-1">Add line items to see totals.</p>
      )}
    </div>
  );
}