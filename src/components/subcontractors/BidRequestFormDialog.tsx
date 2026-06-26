'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, Loader2, Gavel, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'

const genId = () => Math.random().toString(36).slice(2, 10)

const BLANK = {
  request_type: 'bid',
  title: '',
  project_id: '',
  project_name: '',
  project_address: '',
  description: '',
  budget: '',
  scope_of_work: [] as { id: string; title: string }[],
  sub_contractor_ids: [] as string[],
  eta_window_start: '',
  eta_window_end: '',
}

interface Props {
  open: boolean
  onOpenChange: (v: boolean) => void
  bidRequest?: any
  onSaved: () => void
}

export default function BidRequestFormDialog({ open, onOpenChange, bidRequest, onSaved }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState(BLANK)
  const [newScopeItem, setNewScopeItem] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      if (bidRequest) {
        setForm({
          request_type: bidRequest.request_type ?? 'bid',
          title: bidRequest.title ?? '',
          project_id: bidRequest.project_id ?? '',
          project_name: bidRequest.project_name ?? '',
          project_address: bidRequest.project_address ?? '',
          description: bidRequest.description ?? '',
          budget: bidRequest.budget?.toString() ?? '',
          scope_of_work: bidRequest.scope_of_work ?? [],
          sub_contractor_ids: bidRequest.sub_contractor_ids ?? [],
          eta_window_start: bidRequest.eta_window_start ?? '',
          eta_window_end: bidRequest.eta_window_end ?? '',
        })
      } else {
        setForm(BLANK)
        setNewScopeItem('')
      }
    }
  }, [open, bidRequest])

  const { data: projects = [] } = useQuery({
    queryKey: ['projects-active'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, address, status').order('name')
      return data ?? []
    },
    enabled: open,
  })

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: async () => {
      const { data } = await supabase.from('sub_contractors').select('id, business_name, contact_name, contractor_types').order('business_name')
      return data ?? []
    },
    enabled: open,
  })

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const addScopeItem = () => {
    if (!newScopeItem.trim()) return
    set('scope_of_work', [...form.scope_of_work, { id: genId(), title: newScopeItem.trim() }])
    setNewScopeItem('')
  }

  const removeScopeItem = (id: string) => set('scope_of_work', form.scope_of_work.filter(s => s.id !== id))

  const toggleSub = (id: string) => {
    const ids = form.sub_contractor_ids
    set('sub_contractor_ids', ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id])
  }

  const handleProjectSelect = (id: string) => {
    const project = (projects as any[]).find(p => p.id === id)
    set('project_id', id)
    set('project_name', project?.name ?? '')
    set('project_address', project?.address ?? '')
  }

  const handleSave = async () => {
    if (!form.title.trim()) return
    setSaving(true)
    const payload = {
      request_type: form.request_type,
      title: form.title.trim(),
      project_id: form.project_id || null,
      project_name: form.project_name || null,
      project_address: form.project_address || null,
      description: form.description.trim() || null,
      budget: form.budget ? parseFloat(form.budget) : null,
      scope_of_work: form.scope_of_work,
      sub_contractor_ids: form.sub_contractor_ids,
      eta_window_start: form.eta_window_start || null,
      eta_window_end: form.eta_window_end || null,
      status: 'draft',
    }

    if (bidRequest) {
      const { error } = await supabase.from('bid_requests').update(payload).eq('id', bidRequest.id)
      if (error) { toast.error('Failed to update'); setSaving(false); return }
      toast.success('Bid request updated')
    } else {
      const { error } = await supabase.from('bid_requests').insert(payload)
      if (error) { toast.error('Failed to create bid request'); setSaving(false); return }
      toast.success('Bid request created')
    }

    setSaving(false)
    onSaved()
    onOpenChange(false)
  }

  const isEstimate = form.request_type === 'estimate'

  return (
    <Dialog open={open} onOpenChange={v => !saving && onOpenChange(v)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEstimate ? <ClipboardCheck className="w-5 h-5" /> : <Gavel className="w-5 h-5" />}
            {bidRequest ? 'Edit' : 'New'} {isEstimate ? 'Estimate Request' : 'Bid Request'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type toggle */}
          <div className="flex gap-2">
            {['bid', 'estimate'].map(type => (
              <button
                key={type}
                onClick={() => set('request_type', type)}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium capitalize transition-all ${form.request_type === type ? 'border-[#3d3d1e] bg-[#3d3d1e]/10 text-[#3d3d1e]' : 'border-[#D4CFBA] text-[#7A7560] hover:bg-muted'}`}
              >
                {type === 'bid' ? <><Gavel className="w-3.5 h-3.5 inline mr-1" />Bid Request</> : <><ClipboardCheck className="w-3.5 h-3.5 inline mr-1" />Estimate Request</>}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Title <span className="text-red-500">*</span></Label>
            <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Kitchen Plumbing Rough-In" />
          </div>

          <div className="space-y-1.5">
            <Label>Project</Label>
            <Select value={form.project_id || '__none__'} onValueChange={v => v === '__none__' ? set('project_id', '') : handleProjectSelect(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select project">
                  {form.project_id ? (projects as any[]).find(p => p.id === form.project_id)?.name ?? 'Select project' : 'No project'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">No project</SelectItem>
                {(projects as any[]).map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {form.project_address && (
            <p className="text-xs text-[#7A7560] -mt-2">📍 {form.project_address}</p>
          )}

          <div className="space-y-1.5">
            <Label>{isEstimate ? 'Preset Estimate Amount ($)' : 'Internal Budget ($)'}</Label>
            <Input type="number" min="0" step="0.01" value={form.budget} onChange={e => set('budget', e.target.value)} placeholder="0.00" />
            {isEstimate && <p className="text-xs text-[#7A7560]">Shown to contractor for approval</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <Textarea value={form.description} onChange={e => set('description', e.target.value)} placeholder="Describe the work needed…" rows={3} />
          </div>

          {isEstimate && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Scheduling Window Start</Label>
                <Input type="date" value={form.eta_window_start} onChange={e => set('eta_window_start', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Scheduling Window End</Label>
                <Input type="date" value={form.eta_window_end} onChange={e => set('eta_window_end', e.target.value)} />
              </div>
            </div>
          )}

          {/* Scope of Work */}
          <div className="space-y-2">
            <Label>Scope of Work</Label>
            {form.scope_of_work.map(item => (
              <div key={item.id} className="flex items-center gap-2 bg-muted/30 rounded-lg px-3 py-2">
                <span className="flex-1 text-sm">{item.title}</span>
                <button onClick={() => removeScopeItem(item.id)} className="text-[#7A7560] hover:text-red-600">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <div className="flex gap-2">
              <Input
                value={newScopeItem}
                onChange={e => setNewScopeItem(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addScopeItem() } }}
                placeholder="Add scope item…"
                className="flex-1"
              />
              <Button type="button" variant="outline" size="icon" onClick={addScopeItem}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Invited Contractors */}
          <div className="space-y-2">
            <Label>Invite Contractors ({form.sub_contractor_ids.length} selected)</Label>
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto border border-[#D4CFBA] rounded-lg p-2">
              {(subs as any[]).length === 0 && (
                <p className="text-xs text-[#7A7560] text-center py-2">No contractors in directory yet.</p>
              )}
              {(subs as any[]).map(sub => (
                <div key={sub.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/30">
                  <Checkbox
                    id={`sub-${sub.id}`}
                    checked={form.sub_contractor_ids.includes(sub.id)}
                    onCheckedChange={() => toggleSub(sub.id)}
                  />
                  <label htmlFor={`sub-${sub.id}`} className="text-sm cursor-pointer flex-1">
                    {sub.business_name || sub.contact_name}
                    {sub.contractor_types?.length > 0 && (
                      <span className="text-xs text-[#7A7560] ml-1">· {sub.contractor_types.slice(0, 2).join(', ')}</span>
                    )}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button
              className="flex-1 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
              onClick={handleSave}
              disabled={saving || !form.title.trim()}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : bidRequest ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
