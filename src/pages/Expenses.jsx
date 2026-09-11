import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Receipt, Search, CheckCircle2, DollarSign } from 'lucide-react';
import SignedImage from '@/components/shared/SignedImage';
import AddExpenseDialog from '@/components/expenses/AddExpenseDialog';
import { useToast } from '@/components/ui/use-toast';

const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusColors = {
  billed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  unbilled: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  'not-billable': 'bg-muted text-muted-foreground',
};

export default function Expenses() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState(null);
  const [search, setSearch] = useState('');
  const [filterProject, setFilterProject] = useState('__all__');

  const { data: expenses = [], isLoading } = useQuery({
    queryKey: ['expenses'],
    queryFn: () => base44.entities.Expense.list('-created_date', 200),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('name', 100),
  });

  const handleBillableToggle = async (expense) => {
    await base44.entities.Expense.update(expense.id, { billable: !expense.billable });
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
  };

  const filtered = expenses.filter(e => {
    if (search) {
      const q = search.replace(/,/g, '').toLowerCase();
      const amountStr = (e.total_amount || 0).toFixed(2);
      const matchSearch =
        (e.vendor || '').toLowerCase().includes(q) ||
        (e.notes || '').toLowerCase().includes(q) ||
        amountStr.includes(q);
      if (!matchSearch) return false;
    }
    const matchProject = filterProject === '__all__' || e.project_id === filterProject;
    return matchProject;
  });

  const totalUnbilled = filtered.filter(e => e.billable && !e.billed).reduce((s, e) => s + (e.total_amount || 0), 0);
  const totalAll = filtered.reduce((s, e) => s + (e.total_amount || 0), 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-butler text-foreground">Expenses</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track and bill project expenses</p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="gap-2 shrink-0">
          <Plus className="w-4 h-4" />
          Add Expense
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Total Shown</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{fmt(totalAll)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3">
          <p className="text-xs text-muted-foreground">Unbilled Billable</p>
          <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">{fmt(totalUnbilled)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg px-4 py-3 col-span-2 sm:col-span-1">
          <p className="text-xs text-muted-foreground">Total Records</p>
          <p className="text-xl font-bold text-foreground mt-0.5">{filtered.length}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, notes, or amount..." className="pl-9" />
        </div>
        <Select value={filterProject} onValueChange={setFilterProject}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All Projects</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Expense List */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No expenses yet</p>
          <p className="text-sm mt-1">Click "Add Expense" to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(expense => {
            const statusKey = !expense.billable ? 'not-billable' : expense.billed ? 'billed' : 'unbilled';
            const statusLabel = !expense.billable ? 'Not Billable' : expense.billed ? 'Billed' : 'Unbilled';
            return (
              <div key={expense.id} onClick={() => setEditExpense(expense)} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center gap-4 hover:shadow-sm hover:border-primary/40 transition-all cursor-pointer">
                {/* Receipt thumb */}
                {expense.receipt_image ? (
                  <SignedImage src={expense.receipt_image} alt="Receipt" className="w-12 h-12 rounded-md object-cover border border-border shrink-0" />
                ) : (
                  <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <DollarSign className="w-5 h-5 text-muted-foreground" />
                  </div>
                )}

                {/* Details */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm text-foreground truncate">{expense.vendor || 'Unnamed Expense'}</span>
                    <Badge className={`text-xs ${statusColors[statusKey]}`}>{statusLabel}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2 items-center">
                    {expense.project_name && <span>{expense.project_name}</span>}
                    {expense.date && <span>· {expense.date}</span>}
                    {expense.expense_category && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide ${expense.expense_category === 'subcontractor' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {expense.expense_category}
                      </span>
                    )}
                    {expense.cost_code && <span className="font-mono text-[10px] bg-muted px-1.5 py-0.5 rounded">{expense.cost_code}</span>}
                    {(expense.line_items || []).length > 0 && <span>· {expense.line_items.length} items</span>}
                  </div>
                </div>

                {/* Amount */}
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm text-foreground">{fmt(expense.total_amount)}</div>
                  <div className="flex items-center gap-1.5 mt-1 justify-end" onClick={e => e.stopPropagation()}>
                    <span className="text-xs text-muted-foreground">Billable</span>
                    <Switch
                      checked={!!expense.billable}
                      onCheckedChange={() => handleBillableToggle(expense)}
                      className="scale-75 origin-right"
                      disabled={!!expense.billed}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <AddExpenseDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        projects={projects}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['expenses'] })}
      />

      <AddExpenseDialog
        open={!!editExpense}
        onOpenChange={(v) => { if (!v) setEditExpense(null); }}
        projects={projects}
        expense={editExpense}
        onSaved={() => { setEditExpense(null); queryClient.invalidateQueries({ queryKey: ['expenses'] }); }}
        onDeleted={() => { setEditExpense(null); queryClient.invalidateQueries({ queryKey: ['expenses'] }); }}
      />
    </div>
  );
}