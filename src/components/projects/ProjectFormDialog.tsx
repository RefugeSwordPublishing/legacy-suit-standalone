'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import type { Project } from './ProjectsPage'

const STATUSES = ['planning', 'active', 'on_hold', 'completed']
const PHASES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6']
const PHASE_LABELS: Record<string, string> = {
  phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3',
  phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6',
}

const BLANK = { name: '', address: '', client_id: '', client_name: '', status: 'planning', phase: '', budget: '' }

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  project?: Project | null
  onSaved: () => void
}

export default function ProjectFormDialog({ open, onOpenChange, project, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (project) {
      setForm({
        name: project.name,
        address: project.address ?? '',
        client_id: project.client_id ?? '',
        client_name: project.client_name ?? '',
        status: project.status,
        phase: project.phase ?? '',
        budget: project.budget?.toString() ?? '',
      })
    } else {
      setForm(BLANK)
    }
  }, [project, open])

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name').order('name')
      return data ?? []
    },
    enabled: open,
  })

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)

    const selectedClient = clients.find((c: any) => c.id === form.client_id)
    const payload = {
      name: form.name.trim(),
      address: form.address?.trim() || null,
      client_id: form.client_id || null,
      client_name: (selectedClient?.name ?? form.client_name?.trim()) || null,
      status: form.status,
      phase: form.phase || null,
      budget: form.budget ? parseFloat(form.budget) : null,
    }

    if (project) {
      const { error } = await supabase.from('projects').update(payload).eq('id', project.id)
      if (error) { toast.error('Failed to update project'); setSaving(false); return }
      toast.success('Project updated')
    } else {
      const { error } = await supabase.from('projects').insert(payload)
      if (error) { toast.error('Failed to create project'); setSaving(false); return }
      toast.success('Project created')
    }

    setSaving(false)
    onSaved()
  }

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? 'Edit Project' : 'New Project'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Project Name <span className="text-red-500">*</span></Label>
            <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Johnson Kitchen Remodel" required />
          </div>

          <div className="space-y-1.5">
            <Label>Client</Label>
            <Select
              value={form.client_id || '__none__'}
              onValueChange={v => {
                const selected = clients.find((c: any) => c.id === v)
                setForm(f => ({ ...f, client_id: v === '__none__' ? '' : v, client_name: selected?.name ?? '' }))
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select client">
                  {form.client_id ? clients.find((c: any) => c.id === form.client_id)?.name ?? 'Select client' : 'No client'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No client</SelectItem>
                {clients.map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Job site address" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phase</Label>
              <Select value={form.phase || '__none__'} onValueChange={v => setForm(f => ({ ...f, phase: v === '__none__' ? '' : v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="No phase">
                    {form.phase ? PHASE_LABELS[form.phase] : 'No phase'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No phase</SelectItem>
                  {PHASES.map(p => (
                    <SelectItem key={p} value={p}>{PHASE_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Budget</Label>
            <Input type="number" min="0" step="0.01" value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))} placeholder="0.00" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={saving} className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : project ? 'Save Changes' : 'Create Project'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
