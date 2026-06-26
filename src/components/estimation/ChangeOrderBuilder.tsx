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

function fmt(n: number | null) {
  if (!n) return '$0'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

function calcCOTotal(sections: any[], gcFeeEnabled: boolean, gcFeePct: number) {
  const lineTotal = (sections || []).flatMap((s: any) => s.line_items || []).reduce((s: number, i: any) => s + (i.line_total || 0), 0)
  const gcFee = gcFeeEnabled ? lineTotal * ((gcFeePct || 0) / 100) : 0
  return lineTotal + gcFee
}

interface Props { id: string }

export default function ChangeOrderBuilder({ id }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const qc = useQueryClient()
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: 'New Change Order',
    status: 'draft',
    estimate_id: '',
    estimate_number: '',
    project_id: '',
    project_name: '',
    client_id: '',
    client_name: '',
    client_email: '',
    sections: [] as any[],
    gc_fee_enabled: true,
    gc_fee_pct: 13,
    original_estimate_total: 0,
    change_order_total: 0,
    new_contract_total: 0,
    change_order_number: '',
  })

  const { data: existing, isLoading } = useQuery({
    queryKey: ['change-order', id],
    queryFn: async () => {
      const { data } = await supabase.from('client_change_orders').select('*').eq('id', id).single()
      return data
    },
  })

  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates'],
    queryFn: async () => {
      const { data } = await supabase.from('estimates').select('id, estimate_number, title, client_id, client_name, project_id, project_name, grand_total').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title ?? 'New Change Order',
        status: existing.status ?? 'draft',
        estimate_id: existing.estimate_id ?? '',
        estimate_number: existing.estimate_number ?? '',
        project_id: existing.project_id ?? '',
        project_name: existing.project_name ?? '',
        client_id: existing.client_id ?? '',
        client_name: existing.client_name ?? '',
        client_email: existing.client_email ?? '',
        sections: existing.sections ?? [],
        gc_fee_enabled: existing.gc_fee_enabled ?? true,
        gc_fee_pct: existing.gc_fee_pct ?? 13,
        original_estimate_total: existing.original_estimate_total ?? 0,
        change_order_total: existing.change_order_total ?? 0,
        new_contract_total: existing.new_contract_total ?? 0,
        change_order_number: existing.change_order_number ?? '',
      })
    }
  }, [existing])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleEstimateSelect = (estimateId: string) => {
    const est = (estimates as any[]).find(e => e.id === estimateId)
    if (!est) return
    set('estimate_id', estimateId)
    set('estimate_number', est.estimate_number ?? '')
    set('client_id', est.client_id ?? '')
    set('client_name', est.client_name ?? '')
    set('project_id', est.project_id ?? '')
    set('project_name', est.project_name ?? '')
    set('original_estimate_total', est.grand_total ?? 0)
  }

  const coTotal = calcCOTotal(form.sections, form.gc_fee_enabled, form.gc_fee_pct)
  const newContractTotal = (form.original_estimate_total || 0) + coTotal

  const handleSave = async (newStatus?: string) => {
    setSaving(true)
    const payload = {
      title: form.title,
      status: newStatus ?? form.status,
      estimate_id: form.estimate_id || null,
      estimate_number: form.estimate_number || null,
      project_id: form.project_id || null,
      project_name: form.project_name || null,
      client_id: form.client_id || null,
      client_name: form.client_name || null,
      sections: form.sections,
      gc_fee_enabled: form.gc_fee_enabled,
      gc_fee_pct: form.gc_fee_pct,
      original_estimate_total: form.original_estimate_total,
      change_order_total: coTotal,
      new_contract_total: newContractTotal,
    }

    const { error } = await supabase.from('client_change_orders').update(payload).eq('id', id)
    if (error) { toast.error('Failed to save'); setSaving(false); return }
    toast.success(newStatus === 'sent' ? 'Change order marked as sent' : 'Change order saved')
    qc.invalidateQueries({ queryKey: ['change-order', id] })
    qc.invalidateQueries({ queryKey: ['client-change-orders'] })
    setSaving(false)
  }

  if (isLoading) return <div className="flex justify-center items-center py-32"><Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" /></div>

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    sent: 'bg-blue-100 text-blue-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard/estimates" className="p-2 rounded-lg hover:bg-[#D4CFBA]/50 text-[#7A7560]">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#3d3d1e]">{form.title}</h1>
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[form.status] ?? ''}`}>{form.status}</span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => handleSave()} disabled={saving}>
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
            Save
          </Button>
          {form.status === 'draft' && (
            <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => handleSave('sent')} disabled={saving}>
              <Send className="w-3.5 h-3.5 mr-1" /> Mark Sent
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_280px] gap-6">
        <div className="space-y-6">
          {/* Meta */}
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={form.title} onChange={e => set('title', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Linked Estimate</Label>
              <Select value={form.estimate_id || '__none__'} onValueChange={v => v === '__none__' ? set('estimate_id', '') : handleEstimateSelect(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select estimate">
                    {form.estimate_id
                      ? (estimates as any[]).find(e => e.id === form.estimate_id)?.title || form.estimate_number || 'Selected'
                      : 'No estimate linked'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No estimate</SelectItem>
                  {(estimates as any[]).map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.title || e.estimate_number} {e.client_name ? `· ${e.client_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Contract totals */}
            {form.original_estimate_total > 0 && (
              <div className="bg-white/60 border border-[#D4CFBA] rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between text-[#7A7560]">
                  <span>Original Contract</span>
                  <span className="font-medium">{fmt(form.original_estimate_total)}</span>
                </div>
                <div className="flex justify-between text-[#7A7560]">
                  <span>This Change Order</span>
                  <span className="font-medium text-amber-700">+{fmt(coTotal)}</span>
                </div>
                <div className="flex justify-between font-bold text-[#3d3d1e] border-t border-[#D4CFBA] pt-1">
                  <span>New Contract Total</span>
                  <span>{fmt(newContractTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Line items */}
          <div>
            <h3 className="text-sm font-semibold text-[#3d3d1e] mb-3">Change Order Items</h3>
            <SectionsEditor sections={form.sections} onChange={sections => set('sections', sections)} categoryMarkups={DEFAULT_MARKUPS} />
          </div>

          {/* GC Fee */}
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[#3d3d1e]">GC Fee</h3>
              <Switch checked={form.gc_fee_enabled} onCheckedChange={v => set('gc_fee_enabled', v)} />
            </div>
            {form.gc_fee_enabled && (
              <Input type="number" min="0" step="0.1" value={form.gc_fee_pct} onChange={e => set('gc_fee_pct', parseFloat(e.target.value) || 0)} className="w-28 h-8" />
            )}
          </div>
        </div>

        <div>
          <EstimateSummaryPanel sections={form.sections} gcFeeEnabled={form.gc_fee_enabled} gcFeePct={form.gc_fee_pct} gcFeeLabel="GC Fee" />
        </div>
      </div>
    </div>
  )
}
