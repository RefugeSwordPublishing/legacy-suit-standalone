'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const CONTRACTOR_TYPES = [
  'Plumber', 'Electrician', 'Framing', 'Roofer', 'Siding/Gutters',
  'Drywall', 'Painter', 'Flooring', 'Landscaping', 'Trim Work',
  'Miscellaneous', 'HVAC',
]

const BLANK = {
  business_name: '', contact_name: '', email: '', phone: '',
  billing_address: '', contractor_types: [] as string[], notes: '',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  sub?: any
  onSaved: () => void
}

export default function SubContractorFormDialog({ open, onOpenChange, sub, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (sub) {
        setForm({
          business_name: sub.business_name ?? '',
          contact_name: sub.contact_name ?? '',
          email: sub.email ?? '',
          phone: sub.phone ?? '',
          billing_address: sub.billing_address ?? '',
          contractor_types: sub.contractor_types ?? (sub.contractor_type ? [sub.contractor_type] : []),
          notes: sub.notes ?? '',
        })
      } else {
        setForm(BLANK)
      }
    }
  }, [open, sub])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const toggleType = (type: string) => {
    const types = form.contractor_types
    set('contractor_types', types.includes(type) ? types.filter(t => t !== type) : [...types, type])
  }

  const handleSave = async () => {
    if (!form.contact_name.trim() || !form.email.trim()) return
    setSaving(true)
    const payload = {
      business_name: form.business_name.trim() || null,
      contact_name: form.contact_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      billing_address: form.billing_address.trim() || null,
      contractor_types: form.contractor_types.length > 0 ? form.contractor_types : null,
      notes: form.notes.trim() || null,
    }
    if (sub) {
      const { error } = await supabase.from('sub_contractors').update(payload).eq('id', sub.id)
      if (error) { toast.error('Failed to update'); setSaving(false); return }
      toast.success('Contractor updated')
    } else {
      const { error } = await supabase.from('sub_contractors').insert(payload)
      if (error) { toast.error('Failed to add contractor'); setSaving(false); return }
      toast.success('Contractor added')
    }
    setSaving(false)
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sub ? 'Edit Contractor' : 'Add Sub-Contractor'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Business Name</Label>
              <Input value={form.business_name} onChange={e => set('business_name', e.target.value)} placeholder="ABC Plumbing Co." />
            </div>
            <div className="space-y-1.5">
              <Label>Contact Name <span className="text-red-500">*</span></Label>
              <Input value={form.contact_name} onChange={e => set('contact_name', e.target.value)} placeholder="John Smith" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="john@example.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(555) 123-4567" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Contractor Types</Label>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              {CONTRACTOR_TYPES.map(type => (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    id={`type-${type}`}
                    checked={form.contractor_types.includes(type)}
                    onCheckedChange={() => toggleType(type)}
                  />
                  <label htmlFor={`type-${type}`} className="text-sm cursor-pointer">{type}</label>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Billing Address</Label>
            <Input value={form.billing_address} onChange={e => set('billing_address', e.target.value)} placeholder="123 Main St, City, ST 12345" />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any notes…" rows={2} />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button
              className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
              onClick={handleSave}
              disabled={saving || !form.contact_name.trim() || !form.email.trim()}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : sub ? 'Save Changes' : 'Add Contractor'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
