import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AddressAutocomplete from '@/components/shared/AddressAutocomplete';

export default function ClientFormDialog({ client, onClose }) {
  const isEdit = !!client?.id;
  const [form, setForm] = useState({
    name: client?.name || '',
    contact_name: client?.contact_name || '',
    email: client?.email || '',
    phone: client?.phone || '',
    billing_address: client?.billing_address || '',
    city: client?.city || '',
    state: client?.state || '',
    zip: client?.zip || '',
    notes: client?.notes || '',
    status: client?.status || 'active',
  });
  const [saving, setSaving] = useState(false);

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }));

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    if (isEdit) {
      const updated = await base44.entities.Client.update(client.id, form);
      setSaving(false);
      onClose(updated);
    } else {
      const created = await base44.entities.Client.create(form);
      setSaving(false);
      onClose(created);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Client' : 'Add Client'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label>Company / Client Name *</Label>
              <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Acme Renovations" />
            </div>
            <div className="space-y-1">
              <Label>Contact Name</Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith" />
            </div>
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="space-y-1">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Billing Address</Label>
              <AddressAutocomplete value={form.billing_address} onChange={(v) => set('billing_address', v)} placeholder="123 Main St" />
            </div>
            <div className="space-y-1">
              <Label>City</Label>
              <Input value={form.city} onChange={e => set('city', e.target.value)} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>State</Label>
                <Input value={form.state} onChange={e => set('state', e.target.value)} placeholder="TX" />
              </div>
              <div className="space-y-1">
                <Label>ZIP</Label>
                <Input value={form.zip} onChange={e => set('zip', e.target.value)} placeholder="78701" />
              </div>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={3} placeholder="Internal notes..." />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.name.trim()}>
              {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Add Client'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}