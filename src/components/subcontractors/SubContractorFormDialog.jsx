import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

const CONTRACTOR_TYPES = [
  'Plumber', 'Electrician', 'Framing', 'Roofer', 'Siding/Gutters',
  'Drywall', 'Painter', 'Flooring', 'Landscaping', 'Trim Work',
  'Miscellaneous', 'HVAC'
];

const BLANK = { business_name: '', contact_name: '', email: '', phone: '', billing_address: '', contractor_types: [], notes: '' };

export default function SubContractorFormDialog({ open, onOpenChange, sub = null, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // Migrate legacy contractor_type string to array
      const base = sub ? { ...BLANK, ...sub } : BLANK;
      if (sub?.contractor_type && !sub?.contractor_types) {
        base.contractor_types = sub.contractor_type ? [sub.contractor_type] : [];
      }
      setForm(base);
    }
  }, [open, sub]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const toggleType = (type) => {
    const types = form.contractor_types || [];
    if (types.includes(type)) {
      set('contractor_types', types.filter(t => t !== type));
    } else {
      set('contractor_types', [...types, type]);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    if (sub) {
      await base44.entities.SubContractor.update(sub.id, form);
    } else {
      await base44.entities.SubContractor.create(form);
    }
    setSaving(false);
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{sub ? 'Edit Contractor' : 'Add Sub-Contractor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">Business Name</Label>
              <Input value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="ABC Plumbing Co." />
            </div>
            <div>
              <Label className="mb-1 block">Contact Name *</Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith" required />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="mb-1 block">Email *</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" required />
            </div>
            <div>
              <Label className="mb-1 block">Phone</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Contractor Types</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2">
              {CONTRACTOR_TYPES.map(type => (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={`type-${type}`}
                    checked={(form.contractor_types || []).includes(type)}
                    onCheckedChange={() => toggleType(type)}
                  />
                  <label htmlFor={`type-${type}`} className="text-sm cursor-pointer">{type}</label>
                </div>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-1 block">Billing Address</Label>
            <Input value={form.billing_address} onChange={e => set('billing_address', e.target.value)} placeholder="123 Main St, City, ST 12345" />
          </div>
          <div>
            <Label className="mb-1 block">Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes…" rows={2} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || !form.contact_name.trim() || !form.email.trim()}
            >
              {saving ? 'Saving...' : sub ? 'Save Changes' : 'Add Contractor'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}