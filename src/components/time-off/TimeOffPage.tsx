'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Plus, CalendarOff, Check, X, Loader2, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { format, parseISO } from 'date-fns'

const HIGH_ROLES = ['owner', 'coo', 'admin']

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending:  { label: 'Pending',  color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700' },
}

function formatRange(start: string, end: string) {
  if (start === end) return format(parseISO(start), 'MMM d, yyyy')
  return `${format(parseISO(start), 'MMM d')} – ${format(parseISO(end), 'MMM d, yyyy')}`
}

export default function TimeOffPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ start_date: '', end_date: '', reason: '' })
  const [saving, setSaving] = useState(false)
  const [declineId, setDeclineId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')

  const isApprover = HIGH_ROLES.includes(currentUser?.role ?? '')

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['time-off-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('time_off_requests').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!currentUser,
  })

  const visible = isApprover
    ? [...(requests as any[]).filter(r => r.status === 'pending'), ...(requests as any[]).filter(r => r.status !== 'pending')]
    : (requests as any[]).filter(r => r.user_id === currentUser?.user_id)

  const myName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.start_date || !currentUser) return
    setSaving(true)
    const end = form.end_date || form.start_date
    const { error } = await supabase.from('time_off_requests').insert({
      user_id: currentUser.user_id,
      user_name: myName,
      user_role: currentUser.role,
      start_date: form.start_date,
      end_date: end,
      reason: form.reason || null,
      status: 'pending',
    })
    if (error) { toast.error('Failed to submit request'); setSaving(false); return }
    toast.success('Time off request submitted')
    setSaving(false)
    setOpen(false)
    setForm({ start_date: '', end_date: '', reason: '' })
    qc.invalidateQueries({ queryKey: ['time-off-requests'] })
  }

  const approve = async (req: any) => {
    await supabase.from('time_off_requests').update({ status: 'approved', reviewed_by: myName }).eq('id', req.id)
    toast.success('Approved')
    qc.invalidateQueries({ queryKey: ['time-off-requests'] })
  }

  const decline = async () => {
    if (!declineReason.trim() || !declineId) return
    await supabase.from('time_off_requests').update({ status: 'declined', reviewed_by: myName, decline_reason: declineReason.trim() }).eq('id', declineId)
    toast.success('Declined')
    setDeclineId(null)
    setDeclineReason('')
    qc.invalidateQueries({ queryKey: ['time-off-requests'] })
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Time Off</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">Request and manage time off</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]" size="sm">
          <Plus className="w-4 h-4 mr-1" /> Request Time Off
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-[#7A7560]">
          <CalendarOff className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No time off requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((req: any) => {
            const sc = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.pending
            return (
              <div key={req.id} className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm text-[#3d3d1e]">
                      {isApprover ? (req.user_name ?? 'Unknown') + ' — ' : ''}{formatRange(req.start_date, req.end_date)}
                    </p>
                    {req.reason && <p className="text-xs text-[#7A7560] mt-0.5">{req.reason}</p>}
                    {req.decline_reason && <p className="text-xs text-red-600 mt-0.5 italic">Reason: {req.decline_reason}</p>}
                    {req.reviewed_by && req.status !== 'pending' && (
                      <p className="text-xs text-[#7A7560] mt-0.5">Reviewed by {req.reviewed_by}</p>
                    )}
                  </div>
                  <Badge className={`text-[10px] shrink-0 ${sc.color}`}>{sc.label}</Badge>
                </div>
                {isApprover && req.status === 'pending' && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approve(req)}>
                      <Check className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 border-red-300 text-red-600 hover:bg-red-50" onClick={() => setDeclineId(req.id)}>
                      <X className="w-3.5 h-3.5 mr-1" /> Decline
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Request dialog */}
      <Dialog open={open} onOpenChange={v => !saving && setOpen(v)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Request Time Off</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Start Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={form.end_date} min={form.start_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason</Label>
              <Textarea value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} placeholder="Optional..." rows={2} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving} className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Submit Request'}
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Decline reason dialog */}
      <Dialog open={!!declineId} onOpenChange={v => !v && setDeclineId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Decline Reason</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Textarea value={declineReason} onChange={e => setDeclineReason(e.target.value)} placeholder="Reason for declining..." rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclineId(null)}>Cancel</Button>
            <Button onClick={decline} disabled={!declineReason.trim()} className="bg-red-600 hover:bg-red-700 text-white">Decline</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
