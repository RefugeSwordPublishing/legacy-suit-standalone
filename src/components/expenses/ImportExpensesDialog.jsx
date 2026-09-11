import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Receipt, Layers, List } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { v4 as uuidv4 } from 'uuid';

const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ImportExpensesDialog({ open, onOpenChange, expenses, categoryMarkup, onImport }) {
  const { toast } = useToast();
  const [mode, setMode] = useState(null); // 'individual' | 'grouped'
  const [importing, setImporting] = useState(false);

  const total = expenses.reduce((s, e) => s + (e.total_amount || 0), 0);

  const handleImport = async () => {
    if (!mode) return;
    setImporting(true);
    try {
      let lineItems = [];
      if (mode === 'individual') {
        // Each expense's line items become individual lines, or the expense itself if no line items
        expenses.forEach(expense => {
          if ((expense.line_items || []).length > 0) {
            expense.line_items.forEach(li => {
              lineItems.push({
                id: uuidv4(),
                description: li.description || expense.vendor || 'Expense',
                item_description: expense.vendor ? `${expense.vendor}${expense.date ? ' · ' + expense.date : ''}` : '',
                category: 'materials',
                quantity: 1,
                unit: 'LS',
                unit_cost: li.amount || 0,
                markup_pct: categoryMarkup || 0,
                line_total: (li.amount || 0) * (1 + (categoryMarkup || 0) / 100),
              });
            });
          } else {
            lineItems.push({
              id: uuidv4(),
              description: expense.vendor || 'Expense',
              item_description: expense.date || '',
              category: 'materials',
              quantity: 1,
              unit: 'LS',
              unit_cost: expense.total_amount || 0,
              markup_pct: categoryMarkup || 0,
              line_total: (expense.total_amount || 0) * (1 + (categoryMarkup || 0) / 100),
            });
          }
        });
      } else {
        // Grouped, single line
        lineItems.push({
          id: uuidv4(),
          description: 'Materials & Supplies',
          item_description: `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} imported`,
          category: 'materials',
          quantity: 1,
          unit: 'LS',
          unit_cost: total,
          markup_pct: categoryMarkup || 0,
          line_total: total * (1 + (categoryMarkup || 0) / 100),
        });
      }

      // Mark all expenses as billed
      await Promise.all(expenses.map(e => base44.entities.Expense.update(e.id, { billed: true })));

      onImport(lineItems);
      toast({ title: `${expenses.length} expense${expenses.length !== 1 ? 's' : ''} imported!` });
      onOpenChange(false);
      setMode(null);
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setMode(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-primary" />
            Import Expenses
          </DialogTitle>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="bg-muted/30 rounded-lg p-3">
            <p className="text-sm text-muted-foreground mb-2">
              {expenses.length} unbilled billable expense{expenses.length !== 1 ? 's' : ''} found for this project.
            </p>
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {expenses.map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground truncate flex-1">{e.vendor || 'Unnamed expense'}</span>
                  <Badge variant="outline" className="ml-2 shrink-0 text-xs">{fmt(e.total_amount)}</Badge>
                </div>
              ))}
            </div>
            <div className="border-t border-border mt-2 pt-2 flex justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{fmt(total)}</span>
            </div>
          </div>

          <p className="text-sm font-medium text-foreground">How would you like to add these to the estimate?</p>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setMode('individual')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${mode === 'individual' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
            >
              <List className={`w-5 h-5 mb-2 ${mode === 'individual' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="font-medium text-sm">Individual Items</div>
              <p className="text-xs text-muted-foreground mt-0.5">Each line item becomes a separate estimate line.</p>
            </button>
            <button
              onClick={() => setMode('grouped')}
              className={`p-4 rounded-lg border-2 text-left transition-all ${mode === 'grouped' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
            >
              <Layers className={`w-5 h-5 mb-2 ${mode === 'grouped' ? 'text-primary' : 'text-muted-foreground'}`} />
              <div className="font-medium text-sm">Grouped</div>
              <p className="text-xs text-muted-foreground mt-0.5">All expenses summed as "Materials &amp; Supplies".</p>
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleImport} disabled={!mode || importing} className="gap-2">
              {importing && <Loader2 className="w-4 h-4 animate-spin" />}
              Import to Estimate
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}