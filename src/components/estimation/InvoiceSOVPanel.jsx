import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { GitBranch } from 'lucide-react';

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];
const CAT_LABELS = {
  materials: 'Materials',
  labor: 'Labor',
  subcontractor: 'Subcontractor',
  other: 'Other',
};
const CAT_COLORS = {
  materials: 'bg-blue-100 text-blue-700',
  labor: 'bg-amber-100 text-amber-700',
  subcontractor: 'bg-purple-100 text-purple-700',
  other: 'bg-gray-100 text-gray-600',
};

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Props:
 *   lineItems           - raw line items with category field
 *   sovEntries          - array of base SOV entries { category, category_total, previous_pct, current_pct, current_amount }
 *   onChange(entries)   - called when user edits base sov current_pct
 *   coSovEntries        - array of CO SOV entries { change_order_id, change_order_title, category, category_total, current_pct, prev_billed_pct }
 *   onCoSovChange(entries) - called when user edits a CO SOV entry
 *   allInvoices         - all paid/sent invoices for same project (to pull previous_pct from)
 *   estimate            - the linked estimate (for gc_fee fields)
 *   gcSovEntry          - { previous_pct, current_pct } for GC fee row
 *   onGcChange(entry)   - called when GC fee row current_pct changes
 *   clientChangeOrders  - approved ClientChangeOrder records for this project
 */
export default function InvoiceSOVPanel({
  lineItems,
  sovEntries,
  onChange,
  coSovEntries = [],
  onCoSovChange,
  projectId,
  allInvoices = [],
  previousByCategory,
  estimate,
  gcSovEntry,
  onGcChange,
  clientChangeOrders = [],
}) {
  // The GC / PM fee comes in tagged as gc_fee_*; it is NOT a category, it is its own fee row.
  const isGcLine = (li) => (li.source_ref_id || '').startsWith('gc_fee_');
  const lineAmount = (li) => (li.quantity || 0) * (li.unit_cost || 0) * (1 + (li.markup_pct || 0) / 100);

  // Category totals from the real line items only (GC excluded so it isn't double-counted).
  const categoryTotals = useMemo(() => {
    const totals = { materials: 0, labor: 0, subcontractor: 0, other: 0 };
    lineItems.forEach(li => {
      if (isGcLine(li)) return;
      const cat = li.category || 'other';
      totals[cat] = (totals[cat] || 0) + lineAmount(li);
    });
    return totals;
  }, [lineItems]);

  const gcFromLines = useMemo(() => lineItems.filter(isGcLine).reduce((s, li) => s + lineAmount(li), 0), [lineItems]);

  // Previous % billed per category. Prefer the parent's dollar-based tally (previousByCategory),
  // which counts BOTH prior SOV deposits and itemized/progress invoices, then converts to a % of the
  // category contract. This is what lets you bill some lines itemized, then return to SOV mode and
  // still see the right dollars remaining. Fall back to summing prior SOV percentages only when the
  // parent doesn't supply the tally (older callers).
  const previousPct = useMemo(() => {
    if (previousByCategory) {
      const pct = { materials: 0, labor: 0, subcontractor: 0, other: 0 };
      for (const cat of CATEGORIES) {
        const contract = categoryTotals[cat] || 0;
        const billed = Number(previousByCategory[cat]) || 0;
        pct[cat] = contract > 0 ? Math.min(100, (billed / contract) * 100) : 0;
      }
      return pct;
    }
    const pct = { materials: 0, labor: 0, subcontractor: 0, other: 0 };
    const priorInvoices = allInvoices.filter(
      inv => inv.project_id === projectId && inv.billing_mode === 'schedule_of_values' && (inv.status === 'paid' || inv.status === 'sent')
    );
    priorInvoices.forEach(inv => {
      (inv.sov_entries || []).forEach(entry => {
        pct[entry.category] = (pct[entry.category] || 0) + (entry.current_pct || 0);
      });
    });
    return pct;
  }, [allInvoices, projectId, previousByCategory, categoryTotals]);

  // Base estimate SOV entries
  const entries = CATEGORIES.map(cat => {
    const existing = sovEntries.find(e => e.category === cat) || {};
    return {
      category: cat,
      category_total: categoryTotals[cat] || 0,
      previous_pct: previousPct[cat] || 0,
      current_pct: existing.current_pct ?? 0,
      current_amount: ((existing.current_pct ?? 0) / 100) * (categoryTotals[cat] || 0),
    };
  }).filter(e => e.category_total > 0);

  const handlePctChange = (cat, val) => {
    const numVal = Math.min(100, Math.max(0, parseFloat(val) || 0));
    const updated = entries.map(e => {
      if (e.category !== cat) return e;
      return { ...e, current_pct: numVal, current_amount: (numVal / 100) * e.category_total };
    });
    onChange(updated);
  };

  // Approved change orders (needed for GC fee calc below and CO rows)
  const approvedCOs = clientChangeOrders.filter(co => co.status === 'approved');

  // GC Fee: prefer the actual imported GC line amount (13% of the invoice's real line items).
  // Only fall back to computing it from the category subtotal if there is no GC line present.
  const gcFeePct = estimate?.gc_fee_pct ?? 13;
  const gcFeeLabel = lineItems.find(isGcLine)?.name || estimate?.gc_fee_label || 'GC / Project Management Fee';
  const gcFeeEnabled = gcFromLines > 0 || estimate?.gc_fee_enabled === true;
  const regularSubtotal = CATEGORIES.reduce((s, c) => s + (categoryTotals[c] || 0), 0);
  const baseGcFee = gcFromLines > 0 ? gcFromLines : (estimate?.gc_fee_enabled ? regularSubtotal * (gcFeePct / 100) : 0);
  // Add each approved CO's GC fee contribution
  const coGcFee = approvedCOs.reduce((sum, co) => {
    if (co.gc_fee_enabled === true) {
      return sum + (co.change_order_total || 0) * ((co.gc_fee_pct ?? 0) / 100);
    }
    return sum;
  }, 0);
  const gcFeeTotal = baseGcFee + coGcFee;
  const gcEntry = gcSovEntry || {};
  const gcPreviousPct = gcEntry.previous_pct ?? 0;
  const gcCurrentPct = gcEntry.current_pct ?? 0;
  const gcCurrentAmount = (gcCurrentPct / 100) * gcFeeTotal;

  const handleGcPctChange = (val) => {
    const numVal = Math.min(100, Math.max(0, parseFloat(val) || 0));
    onGcChange && onGcChange({ previous_pct: gcPreviousPct, current_pct: numVal, current_amount: (numVal / 100) * gcFeeTotal });
  };

  // Build per-CO per-category totals from CO line items
  const coCategoryTotals = useMemo(() => {
    const map = {}; // { co_id: { category: total } }
    approvedCOs.forEach(co => {
      map[co.id] = {};
      (co.sections || []).forEach(section => {
        (section.line_items || section.items || []).forEach(li => {
          const cat = li.category || 'other';
          map[co.id][cat] = (map[co.id][cat] || 0) + (li.line_total || li.total || 0);
        });
      });
    });
    return map;
  }, [approvedCOs]);

  // Get or initialize a CO SOV entry
  const getCoEntry = (coId, cat) => {
    return coSovEntries.find(e => e.change_order_id === coId && e.category === cat) || {};
  };

  const handleCoSovPctChange = (co, cat, categoryTotal, val) => {
    const numVal = Math.min(100, Math.max(0, parseFloat(val) || 0));
    const coTitle = co.title || co.change_order_number || 'Change Order';

    const existing = coSovEntries.filter(e => !(e.change_order_id === co.id && e.category === cat));
    const updated = [
      ...existing,
      {
        change_order_id: co.id,
        change_order_title: coTitle,
        category: cat,
        category_total: categoryTotal,
        current_pct: numVal,
        prev_billed_pct: getCoEntry(co.id, cat).prev_billed_pct || 0,
        current_amount: (numVal / 100) * categoryTotal,
      },
    ];
    onCoSovChange && onCoSovChange(updated);
  };

  // Total invoice amount
  const baseSovTotal = entries.reduce((s, e) => s + e.current_amount, 0);
  const coSovTotal = coSovEntries.reduce((s, e) => s + ((e.current_pct || 0) / 100) * (e.category_total || 0), 0);
  const invoiceTotal = baseSovTotal + (gcFeeEnabled ? gcCurrentAmount : 0) + coSovTotal;

  if (entries.length === 0) {
    return (
      <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
        Import line items first. Categories with values will appear here for % billing.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Set what % of each category to bill on this invoice. Prior billed % is tracked automatically from paid/sent invoices.
      </p>

      {/* Base Estimate SOV Rows */}
      {entries.map(entry => {
        const remaining = 100 - entry.previous_pct;
        const overBilling = entry.current_pct + entry.previous_pct > 100;
        return (
          <div key={entry.category} className={`rounded-lg border p-3 space-y-2 ${overBilling ? 'border-red-300 bg-red-50' : 'border-border bg-card'}`}>
            <div className="flex items-center justify-between">
              <Badge className={`text-xs border-0 ${CAT_COLORS[entry.category]}`}>
                {CAT_LABELS[entry.category]}
              </Badge>
              <div className="text-right">
                <div className="text-sm font-semibold text-foreground">{fmt(entry.current_amount)}</div>
                {overBilling ? (
                  <div className="text-xs text-red-600">Exceeds 100%</div>
                ) : (
                  <div className="text-xs text-muted-foreground">{(100 - entry.previous_pct - entry.current_pct).toFixed(1)}% remaining</div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <div>
                <span className="block font-medium text-foreground">{fmt(entry.category_total)}</span>
                <span>Total Value</span>
              </div>
              <div className="border-l border-border pl-3">
                <span className="block font-medium text-foreground">{entry.previous_pct.toFixed(1)}%</span>
                <span>Prev. Billed</span>
              </div>
              <div className="border-l border-border pl-3 ml-auto flex items-center gap-2">
                <span className="font-medium text-foreground">Bill Now</span>
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    max={remaining}
                    step="1"
                    value={entry.current_pct}
                    onChange={e => handlePctChange(entry.category, e.target.value)}
                    className="h-9 w-16 text-sm text-center"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* GC Fee Row */}
      {gcFeeEnabled && gcFeeTotal > 0 && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">{gcFeeLabel}</span>
            <div className="text-right">
              <div className="text-sm font-semibold text-foreground">{fmt(gcCurrentAmount)}</div>
              <div className="text-xs text-muted-foreground">{(100 - gcPreviousPct - gcCurrentPct).toFixed(1)}% remaining</div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <div>
              <span className="block font-medium text-foreground">{fmt(gcFeeTotal)}</span>
              <span>Total Value ({gcFeePct}%)</span>
            </div>
            <div className="border-l border-border pl-3">
              <span className="block font-medium text-foreground">{gcPreviousPct.toFixed(1)}%</span>
              <span>Prev. Billed</span>
            </div>
            <div className="border-l border-border pl-3 ml-auto flex items-center gap-2">
              <span className="font-medium text-foreground">Bill Now</span>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min="0"
                  max={100 - gcPreviousPct}
                  step="1"
                  value={gcCurrentPct}
                  onChange={e => handleGcPctChange(e.target.value)}
                  className="h-9 w-16 text-sm text-center"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Per-CO per-category rows */}
      {approvedCOs.map(co => {
        const catTotals = coCategoryTotals[co.id] || {};
        const coCategories = Object.entries(catTotals).filter(([, total]) => total > 0);
        if (coCategories.length === 0) return null;
        const coTitle = co.title || co.change_order_number || 'Change Order';
        return (
          <div key={co.id} className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
              <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs font-semibold text-foreground">{coTitle}</span>
              <span className="text-xs text-muted-foreground ml-auto">{fmt(co.change_order_total || 0)}</span>
            </div>
            <div className="divide-y divide-border">
              {coCategories.map(([cat, catTotal]) => {
                const entry = getCoEntry(co.id, cat);
                const currentPct = entry.current_pct ?? 0;
                const prevPct = entry.prev_billed_pct ?? 0;
                const currentAmount = (currentPct / 100) * catTotal;
                const overBilling = currentPct + prevPct > 100;
                return (
                  <div key={cat} className={`p-3 space-y-2 ${overBilling ? 'bg-red-50' : ''}`}>
                    <div className="flex items-center justify-between">
                      <Badge className={`text-xs border-0 ${CAT_COLORS[cat] || CAT_COLORS.other}`}>
                        {CAT_LABELS[cat] || cat}
                      </Badge>
                      <div className="text-right">
                        <div className="text-sm font-semibold text-foreground">{fmt(currentAmount)}</div>
                        {overBilling ? (
                          <div className="text-xs text-red-600">Exceeds 100%</div>
                        ) : (
                          <div className="text-xs text-muted-foreground">{(100 - prevPct - currentPct).toFixed(1)}% remaining</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <div>
                        <span className="block font-medium text-foreground">{fmt(catTotal)}</span>
                        <span>CO Value</span>
                      </div>
                      <div className="border-l border-border pl-3">
                        <span className="block font-medium text-foreground">{prevPct.toFixed(1)}%</span>
                        <span>Prev. Billed</span>
                      </div>
                      <div className="border-l border-border pl-3 ml-auto flex items-center gap-2">
                        <span className="font-medium text-foreground">Bill Now</span>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            max={100 - prevPct}
                            step="1"
                            value={currentPct}
                            onChange={e => handleCoSovPctChange(co, cat, catTotal, e.target.value)}
                            className="h-9 w-16 text-sm text-center"
                          />
                          <span className="text-xs text-muted-foreground">%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Invoice Total */}
      <div className="bg-muted/30 rounded-lg p-3 flex justify-between items-center">
        <span className="text-sm font-medium text-foreground">Invoice Total (SOV)</span>
        <span className="text-lg font-bold text-foreground">{fmt(invoiceTotal)}</span>
      </div>

      <p className="text-xs text-muted-foreground bg-blue-50 border border-blue-100 rounded p-2">
        <strong>When sent:</strong> Each category becomes one line item. The description will show cumulative % billed to date.
      </p>
    </div>
  );
}