import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Loader2, Zap, ChevronRight, ChevronLeft, Minus, Plus, CheckCircle2, LayoutTemplate, Trash2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { useToast } from '@/components/ui/use-toast';

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 };

function calcLineTotal(item) {
  const base = (item.quantity || 0) * (item.unit_cost || 0);
  return base + base * ((item.markup_pct || 0) / 100);
}

// Step 1: Pick a template
function TemplatePickStep({ templates, isLoading, onPick }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Select a template to use as the basis for your rapid estimate. Templates define the items, you'll just enter quantities.
      </p>
      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading templates...
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <LayoutTemplate className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No templates found. Create a template first to use Rapid Estimate.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {templates.map(tmpl => {
            const itemCount = (tmpl.sections || []).reduce((s, sec) => s + (sec.line_items || []).length, 0);
            return (
              <button
                key={tmpl.id}
                onClick={() => onPick(tmpl)}
                className="w-full text-left bg-card border border-border hover:border-primary hover:shadow-md rounded-lg px-4 py-3 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-foreground group-hover:text-primary">{tmpl.name}</div>
                    {tmpl.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{tmpl.description}</p>
                    )}
                    <div className="flex gap-2 mt-1.5">
                      <Badge variant="outline" className="text-xs">{(tmpl.sections || []).length} sections</Badge>
                      <Badge variant="outline" className="text-xs">{itemCount} items</Badge>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary shrink-0" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compute the auto labor total for a section: sum of qty × labor_cost_per_unit across all material items
function calcAutoLaborTotal(section, quantities) {
  return (section.line_items || [])
    .filter(li => li.category === 'materials' && (li.labor_cost_per_unit || 0) > 0)
    .reduce((sum, li) => {
      const qty = quantities[li.id] ?? li.quantity ?? 1;
      return sum + qty * li.labor_cost_per_unit;
    }, 0);
}

// Step 2: Walk through sections
function SectionQuantityStep({ section, quantities, unitCosts, laborCostsPerUnit, laborTotals, onQuantityChange, onUnitCostChange, onLaborCostPerUnitChange, onLaborTotalChange }) {
  const items = section.line_items || [];
  const laborItem = items.find(i => i.category === 'labor');
  const materialItemsWithLabor = items.filter(i => i.category === 'materials' && ((laborCostsPerUnit[i.id] ?? i.labor_cost_per_unit) || 0) > 0);

  // Re-derive auto total live using overridden labor_cost_per_unit values
  const autoLaborTotal = (section.line_items || [])
    .filter(li => li.category === 'materials')
    .reduce((sum, li) => {
      const qty = quantities[li.id] ?? li.quantity ?? 1;
      const lCost = laborCostsPerUnit[li.id] ?? li.labor_cost_per_unit ?? 0;
      return sum + qty * lCost;
    }, 0);

  const laborTotal = laborItem
    ? (laborTotals[laborItem.id] !== undefined ? laborTotals[laborItem.id] : autoLaborTotal)
    : 0;

  const inputItems = items.filter(i => i.category !== 'labor');

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        Enter quantities and adjust unit costs. {materialItemsWithLabor.length > 0 ? 'Labor cost is auto-calculated, you can override it.' : ''}
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No items in this section.</p>
      ) : (
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {inputItems.map(item => {
            const qty = quantities[item.id] ?? item.quantity ?? 1;
            const isMaterial = item.category === 'materials';
            const unitCost = unitCosts[item.id] ?? item.unit_cost ?? 0;
            const lCostPerUnit = laborCostsPerUnit[item.id] ?? item.labor_cost_per_unit ?? 0;

            return (
              <div key={item.id} className="bg-card border border-border rounded-lg px-4 py-3 space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-foreground">{item.description}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex gap-2 flex-wrap">
                      <span className="capitalize">{item.category}</span>
                      {item.unit && <span>· {item.unit}</span>}
                    </div>
                  </div>
                  {/* Quantity spinner */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => onQuantityChange(item.id, Math.max(0, qty - 1))}
                      className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <Input
                      type="number"
                      min="0"
                      value={qty}
                      onChange={e => onQuantityChange(item.id, parseFloat(e.target.value) || 0)}
                      className="w-14 h-7 text-center text-sm font-semibold px-1"
                    />
                    <button
                      onClick={() => onQuantityChange(item.id, qty + 1)}
                      className="w-7 h-7 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                {/* Cost fields row */}
                <div className="flex gap-2 flex-wrap">
                  <div className="flex items-center gap-1 min-w-[130px]">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">Unit Cost $</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={unitCost}
                      onChange={e => onUnitCostChange(item.id, parseFloat(e.target.value) || 0)}
                      className="h-7 text-sm w-20 text-right"
                    />
                  </div>
                  {isMaterial && (
                    <div className="flex items-center gap-1 min-w-[150px]">
                      <span className="text-xs text-amber-600 dark:text-amber-400 whitespace-nowrap">Labor $/unit</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={lCostPerUnit}
                        onChange={e => onLaborCostPerUnitChange(item.id, parseFloat(e.target.value) || 0)}
                        className="h-7 text-sm w-20 text-right"
                      />
                    </div>
                  )}
                  <div className="ml-auto text-xs text-muted-foreground self-center">
                    Line: <span className="font-semibold text-foreground">
                      ${((qty * unitCost) * (1 + ((item.markup_pct || 0) / 100))).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Labor summary row */}
          {laborItem && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-foreground">{laborItem.description || 'Labor'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {autoLaborTotal > 0 ? `Auto-calc: $${autoLaborTotal.toFixed(2)} · override below` : 'Enter labor total'}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">Total $</span>
                  <Input
                    type="number"
                    min="0"
                    value={laborTotal}
                    onChange={e => onLaborTotalChange(laborItem.id, parseFloat(e.target.value) || 0)}
                    className="h-8 text-right w-28 text-sm font-semibold"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Step 3: Scope of Work editor
function ScopeStep({ scopeItems, onChange }) {
  const [newText, setNewText] = useState('');

  const addItem = () => {
    const text = newText.trim();
    if (!text) return;
    onChange([...scopeItems, { id: uuidv4(), text }]);
    setNewText('');
  };

  const updateItem = (id, text) => onChange(scopeItems.map(i => i.id === id ? { ...i, text } : i));
  const removeItem = (id) => onChange(scopeItems.filter(i => i.id !== id));

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Review and edit the scope of work. Items were pre-filled from your material line items.</p>
      <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-1">
        {scopeItems.map((item, i) => (
          <div key={item.id} className="flex items-center gap-2 group">
            <span className="text-xs text-muted-foreground w-5 shrink-0">{i + 1}.</span>
            <Input
              value={item.text}
              onChange={e => updateItem(item.id, e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <button onClick={() => removeItem(item.id)} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={newText}
          onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItem(); } }}
          placeholder="Add a scope item..."
          className="h-8 text-sm flex-1"
        />
        <Button size="sm" variant="outline" onClick={addItem} className="gap-1.5 shrink-0">
          <Plus className="w-3.5 h-3.5" />
          Add
        </Button>
      </div>
    </div>
  );
}

// Step 4: Summary / confirm
function SummaryStep({ template, quantities, unitCosts, laborCostsPerUnit, laborTotals }) {
  const markups = template.category_markups || DEFAULT_MARKUPS;

  const allItems = (template.sections || []).flatMap(s => {
    const autoLaborTotal = (s.line_items || [])
      .filter(li => li.category === 'materials')
      .reduce((sum, li) => {
        const qty = quantities[li.id] ?? li.quantity ?? 1;
        const lCost = laborCostsPerUnit[li.id] ?? li.labor_cost_per_unit ?? 0;
        return sum + qty * lCost;
      }, 0);
    return (s.line_items || []).map(li => {
      const qty = quantities[li.id] ?? li.quantity ?? 1;
      const isLabor = li.category === 'labor';
      let total;
      if (isLabor) {
        total = laborTotals[li.id] ?? autoLaborTotal;
      } else {
        const uc = unitCosts[li.id] ?? li.unit_cost ?? 0;
        const base = qty * uc;
        total = base + base * ((li.markup_pct || markups[li.category] || 0) / 100);
      }
      return { ...li, qty, total, sectionName: s.name, isLabor };
    }).filter(i => i.isLabor ? i.total > 0 : i.qty > 0);
  });

  const grandTotal = allItems.reduce((s, i) => s + i.total, 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Review your rapid estimate before generating.</p>
      <div className="max-h-[360px] overflow-y-auto pr-1 space-y-1">
        {allItems.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No items with quantity &gt; 0. Go back and enter some quantities.</p>
        ) : allItems.map(item => (
          <div key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md hover:bg-muted/40 text-sm">
            <div className="flex-1 min-w-0">
              <span className="text-foreground">{item.description}</span>
              <span className="text-muted-foreground text-xs ml-2">({item.sectionName})</span>
            </div>
            <div className="text-right shrink-0 text-xs text-muted-foreground">
              {item.isLabor ? 'labor' : `×${item.qty}`}
            </div>
            <div className="text-right shrink-0 font-semibold w-24">
              ${item.total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        ))}
      </div>
      {allItems.length > 0 && (
        <div className="border-t border-border pt-3 flex items-center justify-between">
          <span className="text-sm text-muted-foreground">{allItems.length} items included</span>
          <span className="text-lg font-bold text-foreground">
            ${grandTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
      )}
    </div>
  );
}

export default function RapidEstimateWizard({ open, onOpenChange }) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(0); // 0=pick template, 1..n=sections, n+1=scope, n+2=summary
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [quantities, setQuantities] = useState({}); // { [itemId]: number }
  const [unitCosts, setUnitCosts] = useState({}); // { [itemId]: number }, overridable unit costs
  const [laborCostsPerUnit, setLaborCostsPerUnit] = useState({}); // { [itemId]: number }, overridable labor $/unit
  const [laborTotals, setLaborTotals] = useState({}); // { [itemId]: number }, overridable auto-calc
  const [scopeItems, setScopeItems] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [titleInput, setTitleInput] = useState('');

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['estimate-templates'],
    queryFn: () => base44.entities.EstimateTemplate.list('-created_date', 100),
    enabled: open,
  });

  const sections = selectedTemplate?.sections || [];
  // steps: 0=pick, 1..n=sections, n+1=scope, n+2=summary
  const totalSteps = sections.length + 3;
  const isScopeStep = step === sections.length + 1;
  const isSummaryStep = step === sections.length + 2;
  const currentSection = step >= 1 && step <= sections.length ? sections[step - 1] : null;

  const handlePickTemplate = (tmpl) => {
    setSelectedTemplate(tmpl);
    const initQty = {};
    (tmpl.sections || []).forEach(s =>
      (s.line_items || []).forEach(li => { initQty[li.id] = li.quantity ?? 1; })
    );
    setQuantities(initQty);
    setUnitCosts({});
    setLaborCostsPerUnit({});
    setLaborTotals({});
    // Scope is seeded later (on entering the Scope step) from items with qty > 0.
    setScopeItems([]);
    setTitleInput(`${tmpl.name}, Rapid Estimate`);
    setStep(1);
  };

  const handleQuantityChange = (itemId, val) => {
    setQuantities(q => ({ ...q, [itemId]: val }));
    // Clear any manual override for all labor items so they re-derive from new qty
    // (we only clear if the user hasn't manually overridden, that's handled by laborTotals being absent)
  };

  const handleUnitCostChange = (itemId, val) => {
    setUnitCosts(uc => ({ ...uc, [itemId]: val }));
  };

  const handleLaborCostPerUnitChange = (itemId, val) => {
    setLaborCostsPerUnit(lc => ({ ...lc, [itemId]: val }));
    // Clear any manual labor total override so it re-derives from new per-unit cost
    setLaborTotals(lt => { const n = { ...lt }; delete n[itemId]; return n; });
  };

  const handleLaborTotalChange = (itemId, val) => {
    setLaborTotals(lt => ({ ...lt, [itemId]: val }));
  };

  // Advance a step. When moving into the Scope step, (re)seed the scope list from
  // the non-labor line items that actually have a quantity > 0, so zeroed-out items
  // never carry into the scope of work.
  const goNext = () => {
    if (step === sections.length) {
      const seeded = (selectedTemplate?.sections || []).flatMap(s =>
        (s.line_items || []).filter(li =>
          li.category !== 'labor' &&
          li.description &&
          ((quantities[li.id] ?? li.quantity ?? 1) > 0)
        )
      ).map(li => ({ id: uuidv4(), text: li.description }));
      setScopeItems(seeded);
    }
    setStep(s => s + 1);
  };

  const handleGenerate = async () => {
    const markups = selectedTemplate.category_markups || DEFAULT_MARKUPS;
    const builtSections = (selectedTemplate.sections || []).map(s => {
      // Auto labor total using overridden laborCostsPerUnit
      const autoLaborTotal = (s.line_items || [])
        .filter(li => li.category === 'materials')
        .reduce((sum, li) => {
          const qty = quantities[li.id] ?? li.quantity ?? 1;
          const lCost = laborCostsPerUnit[li.id] ?? li.labor_cost_per_unit ?? 0;
          return sum + qty * lCost;
        }, 0);
      const existingLaborItem = (s.line_items || []).find(li => li.category === 'labor');

      const mappedItems = (s.line_items || [])
        .map(li => {
          const qty = quantities[li.id] ?? li.quantity ?? 1;
          const isLabor = li.category === 'labor';
          const markupPct = li.markup_pct ?? markups[li.category] ?? 0;

          if (isLabor) {
            const overridden = laborTotals[li.id] != null;
            const laborTotal = overridden ? laborTotals[li.id] : autoLaborTotal;
            const resolvedUnitCost = qty > 0 ? laborTotal / qty : laborTotal;
            // A hand-entered labor total is Manual (preserved); a derived one stays Auto.
            return { ...li, id: uuidv4(), quantity: qty, unit_cost: resolvedUnitCost, markup_pct: markupPct, line_total: laborTotal, labor_auto: !overridden, item_description: li.item_description || li.description || '' };
          }

          const resolvedUnitCost = unitCosts[li.id] ?? li.unit_cost ?? 0;
          const resolvedLaborPerUnit = laborCostsPerUnit[li.id] ?? li.labor_cost_per_unit ?? 0;
          const lineTotal = calcLineTotal({ quantity: qty, unit_cost: resolvedUnitCost, markup_pct: markupPct });
          return { ...li, id: uuidv4(), quantity: qty, unit_cost: resolvedUnitCost, labor_cost_per_unit: resolvedLaborPerUnit, markup_pct: markupPct, line_total: lineTotal, item_description: li.item_description || li.description || '' };
        })
        .filter(li => {
          if (li.category === 'labor') return (li.line_total || 0) > 0;
          return (li.quantity || 0) > 0;
        });

      if (!existingLaborItem && autoLaborTotal > 0) {
        const laborMarkupPct = markups.labor ?? 0;
        mappedItems.push({
          id: uuidv4(),
          catalog_item_id: '',
          cost_code_id: '',
          cost_code: '',
          description: 'Labor',
          item_description: '',
          category: 'labor',
          quantity: 1,
          unit: 'LS',
          unit_cost: autoLaborTotal,
          markup_pct: laborMarkupPct,
          line_total: autoLaborTotal + autoLaborTotal * (laborMarkupPct / 100),
          labor_auto: true,
        });
      }

      return { ...s, id: uuidv4(), line_items: mappedItems };
    }).filter(s => s.line_items.length > 0);

    const allItems = builtSections.flatMap(s => s.line_items);
    const subtotal = allItems.reduce((s, i) => s + (i.quantity || 0) * (i.unit_cost || 0), 0);
    const grandTotal = allItems.reduce((s, i) => s + (i.line_total || 0), 0);

    setGenerating(true);
    try {
      const estimateCount = await base44.entities.Estimate.list('-created_date', 1000);
      const nextNum = (estimateCount.length || 0) + 1;
      const estimateNumber = `EST-${String(nextNum).padStart(4, '0')}`;

      const created = await base44.entities.Estimate.create({
        title: titleInput || `${selectedTemplate.name}, Rapid Estimate`,
        status: 'draft',
        estimate_number: estimateNumber,
        category_markups: markups,
        sections: builtSections,
        scope_of_work: scopeItems.filter(i => i.text.trim()),
        subtotal,
        total_markup: grandTotal - subtotal,
        grand_total: grandTotal,
      });
      toast({ title: 'Estimate created!', description: 'You can now review and refine it.' });
      onOpenChange(false);
      navigate(`/estimates/${created.id}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleClose = () => {
    setStep(0);
    setSelectedTemplate(null);
    setQuantities({});
    setUnitCosts({});
    setLaborCostsPerUnit({});
    setLaborTotals({});
    setScopeItems([]);
    setTitleInput('');
    onOpenChange(false);
  };

  const canGoNext = () => {
    if (step === 0) return false; // handled by clicking a template
    return true;
  };

  const getStepLabel = () => {
    if (step === 0) return 'Choose Template';
    if (isScopeStep) return 'Scope of Work';
    if (isSummaryStep) return 'Review & Generate';
    return `Section ${step} of ${sections.length}: ${currentSection?.name || ''}`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl w-full">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            <DialogTitle>Rapid Estimate</DialogTitle>
          </div>
          {selectedTemplate && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">{getStepLabel()}</span>
              {/* Progress dots */}
              <div className="flex gap-1 ml-auto">
                {Array.from({ length: totalSteps }).map((_, i) => (
                  <div
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i < step ? 'bg-primary' : i === step ? 'bg-primary/60' : 'bg-border'}`}
                  />
                ))}
              </div>
            </div>
          )}
        </DialogHeader>

        <div className="mt-2">
          {/* Estimate title input on summary step */}
          {isSummaryStep && (
            <div className="mb-4">
              <label className="text-xs text-muted-foreground block mb-1">Estimate Title</label>
              <Input
                value={titleInput}
                onChange={e => setTitleInput(e.target.value)}
                placeholder="Estimate title..."
                className="font-medium"
              />
            </div>
          )}

          {step === 0 && (
            <TemplatePickStep templates={templates} isLoading={isLoading} onPick={handlePickTemplate} />
          )}

          {currentSection && (
            <SectionQuantityStep
              section={currentSection}
              quantities={quantities}
              unitCosts={unitCosts}
              laborCostsPerUnit={laborCostsPerUnit}
              laborTotals={laborTotals}
              onQuantityChange={handleQuantityChange}
              onUnitCostChange={handleUnitCostChange}
              onLaborCostPerUnitChange={handleLaborCostPerUnitChange}
              onLaborTotalChange={handleLaborTotalChange}
            />
          )}

          {isScopeStep && (
            <ScopeStep scopeItems={scopeItems} onChange={setScopeItems} />
          )}

          {isSummaryStep && (
            <SummaryStep template={selectedTemplate} quantities={quantities} unitCosts={unitCosts} laborCostsPerUnit={laborCostsPerUnit} laborTotals={laborTotals} />
          )}
        </div>

        {/* Footer navigation */}
        {step > 0 && (
          <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
            <Button variant="outline" onClick={() => setStep(s => s - 1)} className="gap-2">
              <ChevronLeft className="w-4 h-4" />
              Back
            </Button>

            {isSummaryStep ? (
              <Button onClick={handleGenerate} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Generate Estimate
              </Button>
            ) : (
              <Button onClick={goNext} className="gap-2">
                {step < sections.length ? 'Next Section' : isScopeStep ? 'Review' : 'Modify Scope'}
                <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}