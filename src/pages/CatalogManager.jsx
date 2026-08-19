import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Pencil, Trash2, Package, Search, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function CostCodeSelect({ value, onChange }) {
  const { data: costCodes = [] } = useQuery({
    queryKey: ['cost-codes'],
    queryFn: () => base44.entities.CostCode.filter({ is_active: true }, 'code', 200),
  });
  return (
    <Select value={value || '__none__'} onValueChange={v => onChange(v === '__none__' ? '' : v)}>
      <SelectTrigger><SelectValue placeholder="No cost code" /></SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">No cost code</SelectItem>
        {costCodes.map(c => (
          <SelectItem key={c.id} value={c.id}>
            <span className="font-mono text-xs mr-2">{c.code}</span>{c.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const CATEGORIES = ['materials', 'labor', 'subcontractor', 'other'];
const CATEGORY_COLORS = {
  materials: 'bg-blue-100 text-blue-800',
  labor: 'bg-green-100 text-green-800',
  subcontractor: 'bg-orange-100 text-orange-800',
  other: 'bg-muted text-muted-foreground',
};

const EMPTY_ITEM = {
  name: '', description: '', category: 'materials',
  unit: '', unit_cost: 0, labor_cost_per_unit: 0, default_quantity: 1, default_markup: 0, notes: '', is_active: true, cost_code_id: '',
};

function CatalogItemForm({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { ...item } : { ...EMPTY_ITEM });
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }));

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'Name required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      if (item?.id) {
        await base44.entities.CatalogItem.update(item.id, form);
      } else {
        await base44.entities.CatalogItem.create(form);
      }
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item?.id ? 'Edit Catalog Item' : 'New Catalog Item'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Name *</label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Item name" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Category</label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Unit</label>
              <Input value={form.unit} onChange={e => set('unit', e.target.value)} placeholder="ea, SF, HR..." />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Unit Cost ($)</label>
              <Input type="number" min="0" value={form.unit_cost}
                onChange={e => set('unit_cost', parseFloat(e.target.value) || 0)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Default Qty</label>
              <Input type="number" min="0" value={form.default_quantity}
                onChange={e => set('default_quantity', e.target.value === '' ? 0 : parseFloat(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Markup %</label>
              <Input type="number" min="0" max="200" value={form.default_markup}
                onChange={e => set('default_markup', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          {form.category === 'materials' && (
            <div>
              <label className="text-xs text-muted-foreground block mb-1">
                Labor $/{form.unit || 'unit'}
              </label>
              <Input type="number" min="0" step="0.01" value={form.labor_cost_per_unit ?? 0}
                onChange={e => set('labor_cost_per_unit', parseFloat(e.target.value) || 0)} />
              <p className="text-[11px] text-muted-foreground mt-1">
                Labor to install one {form.unit || 'unit'}. Adding this material to an estimate auto-fills its labor line. Set the unit to SF for labor per square foot.
              </p>
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Cost Code (optional)</label>
            <CostCodeSelect value={form.cost_code_id} onChange={v => set('cost_code_id', v)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description</label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)}
              placeholder="Optional description" className="h-16 resize-none" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Notes</label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              placeholder="Internal notes" className="h-14 resize-none" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {item?.id ? 'Save Changes' : 'Add to Catalog'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function CatalogManager() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['catalog-items'],
    queryFn: () => base44.entities.CatalogItem.list('name', 500),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['catalog-items'] });

  const filtered = items.filter(item => {
    const matchSearch = item.name?.toLowerCase().includes(search.toLowerCase()) ||
      item.description?.toLowerCase().includes(search.toLowerCase());
    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
    return matchSearch && matchCat;
  });

  const handleDelete = async () => {
    await base44.entities.CatalogItem.delete(deleteTarget.id);
    setDeleteTarget(null);
    refresh();
    toast({ title: 'Item deleted' });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{items.length} item{items.length !== 1 ? 's' : ''} in catalog</p>
        <Button onClick={() => { setEditTarget(null); setFormOpen(true); }} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Item
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search catalog..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {['all', ...CATEGORIES].map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                categoryFilter === cat ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Package className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{items.length === 0 ? 'No catalog items yet. Add your first item.' : 'No items match your search.'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-lg px-4 py-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-foreground">{item.name}</span>
                  <Badge className={`text-xs capitalize ${CATEGORY_COLORS[item.category] || ''}`}>
                    {item.category}
                  </Badge>
                  {!item.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                </div>
                {item.description && <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.description}</p>}
              </div>
              <div className="text-right text-sm shrink-0 mr-3">
                {item.unit_cost > 0 && <div className="font-semibold">${item.unit_cost}{item.unit ? `/${item.unit}` : ''}</div>}
                <div className="text-xs text-muted-foreground">
                  {item.labor_cost_per_unit > 0 && `+$${item.labor_cost_per_unit} labor/${item.unit || 'unit'} · `}
                  {item.default_quantity !== 1 && `Qty: ${item.default_quantity} · `}
                  {item.default_markup > 0 && `${item.default_markup}% markup`}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button variant="ghost" size="icon" onClick={() => { setEditTarget(item); setFormOpen(true); }}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(item)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {formOpen && (
        <CatalogItemForm
          item={editTarget}
          onClose={() => setFormOpen(false)}
          onSaved={() => { setFormOpen(false); refresh(); }}
        />
      )}

      {deleteTarget && (
        <AlertDialog open onOpenChange={() => setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete "{deleteTarget.name}"?</AlertDialogTitle>
              <AlertDialogDescription>This will remove it from the catalog. Existing estimates won't be affected.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}