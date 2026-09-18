const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];

function fmt(n) {
  return (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Accept either sections (new) or flat items (legacy)
function getAllItems(sections) {
  if (!sections || sections.length === 0) return [];
  return sections.flatMap(s => s.line_items || []);
}

export default function EstimateSummaryPanel({ sections = [], items: legacyItems, gcFeeEnabled, gcFeePct, gcFeeLabel }) {
  const items = sections.length > 0 ? getAllItems(sections) : (legacyItems || []);

  const byCategory = CATEGORIES.map(cat => {
    const catItems = items.filter(i => i.category === cat);
    const base = catItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
    const total = catItems.reduce((s, i) => s + (i.line_total || 0), 0);
    return { cat, base, markup: total - base, total, count: catItems.length };
  }).filter(c => c.count > 0);

  const subtotal = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
  const lineTotal = items.reduce((s, i) => s + (i.line_total || 0), 0);
  const totalMarkup = lineTotal - subtotal;
  const gcFeeAmount = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0;
  const grandTotal = lineTotal + gcFeeAmount;

  // Per-section subtotals
  const sectionTotals = sections.filter(s => (s.line_items || []).length > 0).map(s => ({
    name: s.name,
    total: (s.line_items || []).reduce((sum, i) => sum + (i.line_total || 0), 0),
  }));

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4 xl:sticky xl:top-4">
      <h3 className="text-sm font-semibold">Summary</h3>

      {sectionTotals.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Section</p>
          {sectionTotals.map(s => (
            <div key={s.name} className="flex justify-between text-xs">
              <span className="text-muted-foreground truncate mr-2">{s.name}</span>
              <span className="font-medium">${fmt(s.total)}</span>
            </div>
          ))}
        </div>
      )}

      {byCategory.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">By Category</p>
          {byCategory.map(({ cat, base, markup, total }) => (
            <div key={cat} className="text-sm">
              <div className="flex justify-between font-medium capitalize text-foreground">
                <span>{cat}</span>
                <span>${fmt(total)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>Base</span><span>${fmt(base)}</span>
              </div>
              <div className="flex justify-between text-xs text-muted-foreground pl-2">
                <span>Markup</span><span>${fmt(markup)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="border-t border-border pt-3 space-y-1.5">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal</span><span>${fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Total Markup</span><span>${fmt(totalMarkup)}</span>
        </div>
        {gcFeeEnabled && gcFeeAmount > 0 && (
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{gcFeeLabel || 'GC Fee'} ({gcFeePct}%)</span><span>${fmt(gcFeeAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-bold text-foreground border-t border-border pt-2 mt-2">
          <span>Grand Total</span><span>${fmt(grandTotal)}</span>
        </div>
      </div>

      {items.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Add items to see totals.</p>
      )}
    </div>
  );
}