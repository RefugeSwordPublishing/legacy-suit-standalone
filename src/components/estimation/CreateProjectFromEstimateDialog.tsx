'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const PROJECT_STATUSES = ['planning', 'active', 'on_hold', 'completed']
const PROJECT_PHASES = ['Estimating', 'Contract Signed', 'Pre-Construction', 'In Progress', 'Punch List', 'Complete']

interface Props {
  open: boolean
  onClose: () => void
  estimateTitle: string
  clientId: string
  clientName: string
  estimateId: string
  onProjectCreated: (projectId: string, projectName: string) => void
}

export default function CreateProjectFromEstimateDialog({ open, onClose, estimateTitle, clientId, clientName, estimateId, onProjectCreated }: Props) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: estimateTitle || '',
    status: 'planning',
    phase: 'Contract Signed',
    budget: '',
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name')
      return data ?? []
    },
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleCreate = async () => {
    if (!form.name.trim()) { toast.error('Project name is required'); return }
    setSaving(true)
    const { data, error } = await supabase.from('projects').insert({
      name: form.name.trim(),
      status: form.status,
      phase: form.phase,
      budget: form.budget ? parseFloat(form.budget) : null,
      client_id: clientId || null,
      client_name: clientName || null,
    }).select().single()
    if (error) { toast.error('Failed to create project'); setSaving(false); return }
    qc.invalidateQueries({ queryKey: ['projects'] })
    toast.success(`Project "${data.name}" created`)
    onProjectCreated(data.id, data.name)
    onClose()
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create Project from Estimate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Project Name</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Project name..." />
          </div>
          <div className="space-y-1.5">
            <Label>Client</Label>
            <p className="text-sm text-[#7A7560]">{clientName || 'No client linked to estimate'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_STATUSES.map(s => <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={form.phase} onValueChange={v => set('phase', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROJECT_PHASES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Budget (optional)</Label>
            <Input type="number" min="0" step="0.01" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="From estimate total..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleCreate} disabled={saving} className="bg-[#3d3d1e] hover:bg-[#2c2c14] text-[#EAE8E1]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
