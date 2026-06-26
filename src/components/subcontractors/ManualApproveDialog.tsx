'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  bidRequest: any
  onApproved: () => void
}

export default function ManualApproveDialog({ open, onOpenChange, bidRequest, onApproved }: Props) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [contractorId, setContractorId] = useState('')
  const [bidAmount, setBidAmount] = useState('')
  const [saving, setSaving] = useState(false)

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: async () => {
      const { data } = await supabase.from('sub_contractors').select('id, business_name, contact_name, email').order('business_name')
      return data ?? []
    },
    enabled: open,
  })

  const handleSubmit = async () => {
    if (!contractorId || !bidAmount) { toast.error('Select a contractor and enter a bid amount'); return }
    setSaving(true)
    const contractor = (subs as any[]).find(s => s.id === contractorId)

    // Create submission
    const { data: submission, error: subError } = await supabase.from('bid_submissions').insert({
      bid_request_id: bidRequest.id,
      sub_contractor_id: contractorId,
      sub_contractor_name: contractor.business_name || contractor.contact_name,
      sub_contractor_email: contractor.email,
      bid_amount: parseFloat(bidAmount),
      status: 'approved',
    }).select().single()

    if (subError) { toast.error('Failed to create submission'); setSaving(false); return }

    // Mark bid request as awarded
    await supabase.from('bid_requests').update({
      status: 'awarded',
      awarded_to_name: contractor.business_name || contractor.contact_name,
    }).eq('id', bidRequest.id)

    toast.success('Bid manually approved')
    setSaving(false)
    setContractorId('')
    setBidAmount('')
    qc.invalidateQueries({ queryKey: ['bid-requests'] })
    qc.invalidateQueries({ queryKey: ['bid-submissions'] })
    onOpenChange(false)
    onApproved()
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Manually Approve Bid
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Contractor</Label>
            <Select value={contractorId} onValueChange={setContractorId}>
              <SelectTrigger><SelectValue placeholder="Select a contractor…" /></SelectTrigger>
              <SelectContent>
                {(subs as any[]).map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.business_name || s.contact_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Bid Amount ($)</Label>
            <Input type="number" min="0" step="0.01" placeholder="e.g. 12500" value={bidAmount} onChange={e => setBidAmount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={handleSubmit} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle className="w-4 h-4 mr-1.5" />}
            {saving ? 'Approving…' : 'Approve Bid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
