'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { ArrowLeft, Save, Loader2, Send } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import SectionsEditor from './SectionsEditor'
import EstimateSummaryPanel from './EstimateSummaryPanel'

const DEFAULT_MARKUPS = { materials: 20, labor: 15, subcontractor: 10, other: 0 }

function calcTotals(sections: any[], gcFeeEnabled: boolean, gcFeePct: number) {
  const allItems = (sections || []).flatMap((s: any) => s.line_items || [])
  const lineTotal = allItems.reduce((s: number, i: any) => s + (i.line_total || 0), 0)
  const gcFeeAmount = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0
  return { grand_total: lineTotal + gcFeeAmount }
}

const BLANK = {
  title: '',
  status: 'draft',
  client_id: '',
  client_name: '',
  project_id: '',
  project_name: '',
  sections: [] as any[],
  gc_fee_enabled: true,
  gc_fee_pct: 13,
  gc_fee_label: 'GC / Project Management Fee',
  category_markups: { ...DEFAULT_MARKUPS },
  estimate_number: '',
  grand_total: 0,
}

interface Props { id: string }

export default function EstimateBuilder({ id }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const qc = useQueryClient()
  const isNew = id === 'new'
  const [form, setForm] = useState(BLANK)
  const [saving, setSaving] = useState(false)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['estimate', id],
    queryFn: async () => {
      const { data } = await supabase.from('estimates').select('*').eq('id', id).single()
      return data
    },
    enabled: !isNew,
  })

  const { data: clients = [] } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => {
      const { data } = await supabase.from('clients').select('id, name, email').order('name')
      return data ?? []
    },
  })

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name').order('name')
      return data ?? []
    },
  })

  const { data: allEstimates = [] } = useQuery({
    queryKey: ['estimates-count'],
    queryFn: async () => {
      const { data } = await supabase.from('estimates').select('estimate_number')
      return data ?? []
    },
    enabled: isNew,
  })

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title ?? '',
        status: existing.status ?? 'draft',
        client_id: existing.client_id ?? '',
        client_name: existing.client_name ?? '',
        project_id: existing.project_id ?? '',
        project_name: existing.project_name ?? '',
        sections: existing.sections ?? [],
        gc_fee_enabled: existing.gc_fee_enabled ?? true,
        gc_fee_pct: existing.gc_fee_pct ?? 13,
        gc_fee_label: existing.gc_fee_label ?? 'GC / Project Management Fee',
        category_markups: existing.category_markups ?? DEFAULT_MARKUPS,
        estimate_number: existing.estimate_number ?? '',
        grand_total: existing.grand_total ?? 0,
      })
    }
  }, [existing])

  useEffect(() => {
    if (isNew && allEstimates.length >= 0) {
      const nums = (allEstimates as any[]).map(e => parseInt(e.estimate_number?.replace(/\D/g, '') || '0')).filter(n => !isNaN(n))
      const next = nums.length > 0 ? Math.max(...nums) + 1 : 1001
      setForm(f => ({ ...f, estimate_number: `EST-${String(next).padStart(4, '0')}` }))
    }
  }, [isNew, allEstimates.length])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleClientSelect = (clientId: string) => {
    const client = (clients as any[]).find(c => c.id === clientId)
    set('client_id', clientId)
    set('client_name', client?.name ?? '')
  }

  const handleProjectSelect = (projectId: string) => {
    const project = (projects as any[]).find(p => p.id === projectId)
    set('project_id', projectId)
    set('project_name', project?.name ?? '')
  }

  const handleSave = async (newStatus?: string) => {
    setSaving(true)
    const { grand_total } = calcTotals(form.sections, form.gc_fee_enabled, form.gc_fee_pct)
    const payload = {
      title: form.title.trim() || form.estimate_number,
      status: newStatus ?? form.status,
      client_id: form.client_id || null,
      client_name: form.client_name || null,
      project_id: form.project_id || null,
      project_name: form.project_name || null,
      sections: form.sections,
      gc_fee_enabled: form.gc_fee_enabled,
      gc_fee_pct: form.gc_fee_pct,
      gc_fee_label: form.gc_fee_label,
      category_markups: form.category_markups,
      estimate_number: form.estimate_number,
      grand_total,
    }

    if (isNew) {
      const { data, error } = await supabase.from('estimates').insert(payload).select().single()
      if (error) { toast.error('Failed to create estimate'); setSaving(false); return }
      toast.success('Estimate created')
      qc.invalidateQueries({ queryKey: ['estimates'] })
      router.push(`/dashboard/estimates/${data.id}`)
    } else {
      const { error } = await supabase.from('estimates').update(payload).eq('id', id)
      if (error) { toast.error('Failed to save'); setSaving(false); return }
      toast.success(newStatus === 'sent' ? 'Estimate marked as sent' : 'Estimate saved')
      qc.invalidateQueries({ queryKey: ['estimate', id] })
      qc.invalidateQueries({ queryKey: ['estimates'] })
    }

    setSaving(false)
  }

  if (!isNew && isLoading) {
    return <div className="flex justify-center items-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" /></div>
  }

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/estimates" className="p-2 rounded-lg hover:bg-[#D4CFBA]/50 text-[#7A7560]">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[#3d3d1e]">{form.estimate_number || 'New Estimate'}</h1>
            {!isNew && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] ?? ''}`}>{form.status}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
          {!isNew && form.status === 'draft' && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSave('sent')} disabled={saving}>
              <Send className="w-3.5 h-3.5 mr-1" /> Mark Sent
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        {/* Left: form */}
        <div className="space-y-6">
          {/* Meta */}
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} placeholder="e.g. Kitchen Renovation Estimate" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Client</Label>
                <Select value={form.client_id || '__none__'} onValueChange={v => v === '__none__' ? (set('client_id', ''), set('client_name', '')) : handleClientSelect(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select client">
                      {form.client_id ? (clients as any[]).find(c => c.id === form.client_id)?.name ?? 'Select client' : 'No client'}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No client</SelectItem>
                    {(clients as any[]).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Project</Label>
                <Select value={form.project_id || '__none__'} onValueChange={v => v === '__none__' ? (set('project_id', ''), set('project_name', '')) : handleProjectSelect(v)}>
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
            </div>
          </div>

          {/* Category Markups */}
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-[#3d3d1e] mb-3">Category Markups (%)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(form.category_markups).map(([cat, pct]) => (
                <div key={cat} className="space-y-1">
                  <Label className="capitalize text-xs">{cat}</Label>
                  <Input
                    type="number" min="0" step="0.1"
                    value={pct}
                    onChange={e => set('category_markups', { ...form.category_markups, [cat]: parseFloat(e.target.value) || 0 })}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Sections */}
          <div>
            <h3 className="text-sm font-semibold text-[#3d3d1e] mb-3">Line Items</h3>
            <SectionsEditor
              sections={form.sections}
              onChange={sections => set('sections', sections)}
              categoryMarkups={form.category_markups}
            />
          </div>

          {/* GC Fee */}
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#3d3d1e]">GC / Project Management Fee</h3>
                <p className="text-xs text-[#7A7560]">Applied on top of all line item totals</p>
              </div>
              <Switch checked={form.gc_fee_enabled} onCheckedChange={v => set('gc_fee_enabled', v)} />
            </div>
            {form.gc_fee_enabled && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Fee %</Label>
                  <Input type="number" min="0" step="0.1" value={form.gc_fee_pct} onChange={e => set('gc_fee_pct', parseFloat(e.target.value) || 0)} className="h-8" />
                </div>
                <div className="space-y-1.5">
                  <Label>Label</Label>
                  <Input value={form.gc_fee_label} onChange={e => set('gc_fee_label', e.target.value)} className="h-8" />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: summary */}
        <div>
          <EstimateSummaryPanel
            sections={form.sections}
            gcFeeEnabled={form.gc_fee_enabled}
            gcFeePct={form.gc_fee_pct}
            gcFeeLabel={form.gc_fee_label}
          />
        </div>
      </div>
    </div>
  )
}
