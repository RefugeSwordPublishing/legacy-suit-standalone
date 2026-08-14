import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Tags, Plus, Trash2, Loader2, Info } from 'lucide-react';
import SettingsBack from '@/components/shared/SettingsBack';

const BUCKETS = [
  { value: 'materials', label: 'Materials' },
  { value: 'subcontractor', label: 'Subcontractor' },
  { value: 'labor', label: 'Labor' },
  { value: 'other', label: 'Other' },
];

export default function ExpenseCategories() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [bucket, setBucket] = useState('materials');
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expense-categories-all'] });
    queryClient.invalidateQueries({ queryKey: ['expense-categories'] });
  };

  const { data: cats = [], isLoading } = useQuery({
    queryKey: ['expense-categories-all'],
    queryFn: () => base44.entities.ExpenseCategory.list('sort_order', 200),
  });

  const add = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.ExpenseCategory.create({ name: name.trim(), cost_bucket: bucket, sort_order: cats.length });
      setName(''); setBucket('materials');
      invalidate();
    } catch (e) {
      toast({ title: 'Could not add category', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const patch = async (id, updates) => {
    try { await base44.entities.ExpenseCategory.update(id, updates); invalidate(); }
    catch (e) { toast({ title: 'Could not update', description: e.message, variant: 'destructive' }); }
  };

  const remove = async (cat) => {
    if (!window.confirm(`Delete "${cat.name}"? Existing expenses keep their label; you just can't pick it for new ones.`)) return;
    try { await base44.entities.ExpenseCategory.delete(cat.id); invalidate(); }
    catch (e) { toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-5">
      <SettingsBack />
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <Tags className="w-7 h-7" /> Expense Categories
        </h1>
        <p className="text-sm text-muted-foreground mt-1">The categories your crew choose when logging an expense.</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
        <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground font-medium mb-1">What's a "cost bucket"?</p>
          On a project's Financials tab, actual costs are grouped into <strong>Materials</strong> and <strong>Subcontractor</strong> so you can compare them to your estimate. Each expense category maps to one of those buckets. Set a category to <strong>Subcontractor</strong> and its expenses land on the subcontractor line; anything else (Materials, Labor, Other) rolls into materials/costs. So a category like "Permits" or "Fuel" still shows up in your project's actual spend.
        </div>
      </div>

      {/* Add */}
      <div className="bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px_auto] gap-3 items-end">
          <div>
            <Label>New category</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Permits, Equipment Rental, Fuel" onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div>
            <Label>Cost bucket</Label>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={saving || !name.trim()} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {cats.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No categories yet.</p>}
          {cats.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 px-4 py-3">
              <Input
                defaultValue={cat.name}
                onBlur={e => e.target.value.trim() && e.target.value !== cat.name && patch(cat.id, { name: e.target.value.trim() })}
                className="flex-1 h-8"
              />
              <Select value={cat.cost_bucket} onValueChange={v => patch(cat.id, { cost_bucket: v })}>
                <SelectTrigger className="w-40 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BUCKETS.map(b => <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5 shrink-0" title="Active">
                <Switch checked={cat.is_active !== false} onCheckedChange={v => patch(cat.id, { is_active: v })} />
              </div>
              <button onClick={() => remove(cat)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Cost bucket: "Subcontractor" rolls into the subcontractor line on project financials; everything else rolls into materials/costs.</p>
    </div>
  );
}
