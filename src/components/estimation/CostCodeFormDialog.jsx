import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

export default function CostCodeFormDialog({ code, onClose }) {
  const isEdit = !!code;
  const [form, setForm] = useState({
    code: code?.code || '',
    name: code?.name || '',
    description: code?.description || '',
    category: code?.category || '',
    is_active: code?.is_active ?? true,
  });
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSave = async () => {
    if (!form.code.trim() || !form.name.trim()) return;
    setSaving(true);
    if (isEdit) {
      await base44.entities.CostCode.update(code.id, form);
    } else {
      await base44.entities.CostCode.create(form);
    }
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Cost Code' : 'Add Cost Code'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Code *</Label>
              <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="03-100" className="font-mono" />
            </div>
            <div className="space-y-1">
              <Label>Category</Label>
              <Input value={form.category} onChange={e => set('category', e.target.value)} placeholder="Framing, Electrical..." />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Concrete Formwork" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => set('description', e.target.value)} rows={2} placeholder="Optional notes..." />
            </div>
            <div className="col-span-2 flex items-center gap-2 pt-1">
              <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} id="is-active" />
              <Label htmlFor="is-active">Active</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.code.trim() || !form.name.trim()}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Cost Code'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}