'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { PlusCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  bidRequest: any
  submission: any
  onSaved: () => void
}

export default function ChangeOrderDialog({ open, onOpenChange, bidRequest, submission, onSaved }: Props) {
  const supabase = createClient()
  const { data: currentUser } = useCurrentUser()
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) return
    setSaving(true)
    const myName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email
    const { error } = await supabase.from('sub_change_orders').insert({
      bid_request_id: bidRequest.id,
      bid_submission_id: submission.id,
      description: description.trim() || null,
      amount: parseFloat(amount),
      status: 'approved',
    })
    if (error) { toast.error('Failed to add change order'); setSaving(false); return }
    toast.success('Change order added')
    setSaving(false)
    setAmount('')
    setDescription('')
    onSaved()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#3d3d1e]" />
            Add Change Order
          </DialogTitle>
          <p className="text-sm text-[#7A7560]">{submission?.sub_contractor_name} · {bidRequest?.project_name}</p>
        </DialogHeader>
        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label>Additional Amount ($) <span className="text-red-500">*</span></Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 2500" />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the additional work…" rows={3} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button
              className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
              onClick={handleSave}
              disabled={saving || !amount || isNaN(parseFloat(amount))}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add Change Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
