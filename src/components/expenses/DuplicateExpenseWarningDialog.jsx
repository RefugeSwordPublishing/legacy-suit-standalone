import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function ExpenseSnapshot({ label, expense, lineItems }) {
  return (
    <div className="flex-1 min-w-0 border border-border rounded-lg p-3 bg-muted/20">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">{label}</p>
      <p className="text-sm font-bold text-foreground">{expense.vendor || 'Unnamed'}</p>
      {expense.project_name && <p className="text-xs text-muted-foreground">{expense.project_name}</p>}
      {expense.date && <p className="text-xs text-muted-foreground">{expense.date}</p>}
      <p className="text-base font-bold text-foreground mt-1">{fmt(expense.total_amount)}</p>
      {lineItems && lineItems.length > 0 && (
        <div className="mt-2 space-y-0.5">
          {lineItems.map((li, i) => (
            <div key={li.id || i} className="flex justify-between text-xs text-muted-foreground">
              <span className="truncate flex-1 mr-2">{li.description || ''}</span>
              <span className="shrink-0">{fmt(li.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DuplicateExpenseWarningDialog({ open, onOpenChange, newExpense, existingExpense, onSubmitAnyway, onDiscard }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-[calc(100vw-2rem)] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            Possible Duplicate Expense
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground mb-4">
          An existing expense with the same total amount was found. Please compare before submitting.
        </p>
        <div className="flex flex-col sm:flex-row gap-3">
          <ExpenseSnapshot label="Existing" expense={existingExpense || {}} lineItems={existingExpense?.line_items} />
          <ExpenseSnapshot label="New" expense={newExpense || {}} lineItems={newExpense?.line_items} />
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2 mt-4 sm:justify-end">
          <Button variant="outline" onClick={onDiscard}>Discard New</Button>
          <Button onClick={onSubmitAnyway}>Submit Anyway</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}