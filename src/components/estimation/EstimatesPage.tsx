'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Plus, FileText, GitBranch, Pencil, Trash2, Loader2, DollarSign } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { format } from 'date-fns'

const STATUS_COLORS: Record<string, string> = {
  draft:    'bg-muted text-muted-foreground',
  sent:     'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const CO_STATUS_COLORS: Record<string, string> = {
  draft:    'bg-muted text-muted-foreground',
  sent:     'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function fmt(n: number | null) {
  if (!n) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function EstimatesPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('estimates')
  const [deleteTarget, setDeleteTarget] = useState<any>(null)
  const [deleteCOTarget, setDeleteCOTarget] = useState<any>(null)

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates'],
    queryFn: async () => {
      const { data } = await supabase.from('estimates').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: changeOrders = [], isLoading: loadingCOs } = useQuery({
    queryKey: ['client-change-orders'],
    queryFn: async () => {
      const { data } = await supabase.from('client_change_orders').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const handleNewEstimate = () => router.push('/dashboard/estimates/new')

  const handleNewCO = async () => {
    const { data, error } = await supabase.from('client_change_orders').insert({
      status: 'draft',
      title: 'New Change Order',
    }).select().single()
    if (error) { toast.error('Failed to create change order'); return }
    router.push(`/dashboard/change-orders/${data.id}`)
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    await supabase.from('estimates').delete().eq('id', deleteTarget.id)
    toast.success('Estimate deleted')
    setDeleteTarget(null)
    qc.invalidateQueries({ queryKey: ['estimates'] })
  }

  const handleDeleteCO = async () => {
    if (!deleteCOTarget) return
    await supabase.from('client_change_orders').delete().eq('id', deleteCOTarget.id)
    toast.success('Change order deleted')
    setDeleteCOTarget(null)
    qc.invalidateQueries({ queryKey: ['client-change-orders'] })
  }

  const filteredEstimates = (estimates as any[]).filter(e =>
    !search ||
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    e.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number?.toLowerCase().includes(search.toLowerCase())
  )

  const filteredCOs = (changeOrders as any[]).filter(co =>
    !search ||
    co.title?.toLowerCase().includes(search.toLowerCase()) ||
    co.client_name?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Estimates</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">{(estimates as any[]).length} estimates · {(changeOrders as any[]).length} change orders</p>
        </div>
        <div className="flex gap-2">
          {tab === 'estimates' && (
            <Button onClick={handleNewEstimate} size="sm" className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
              <Plus className="w-4 h-4 mr-1" /> New Estimate
            </Button>
          )}
          {tab === 'change-orders' && (
            <Button onClick={handleNewCO} size="sm" className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
              <Plus className="w-4 h-4 mr-1" /> New Change Order
            </Button>
          )}
        </div>
      </div>

      <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="mb-4" />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="estimates" className="flex items-center gap-2">
            <FileText className="w-4 h-4" /> Estimates
          </TabsTrigger>
          <TabsTrigger value="change-orders" className="flex items-center gap-2">
            <GitBranch className="w-4 h-4" /> Change Orders
          </TabsTrigger>
        </TabsList>

        <TabsContent value="estimates">
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>
          ) : filteredEstimates.length === 0 ? (
            <div className="text-center py-16 text-[#7A7560]">
              <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No estimates yet.</p>
              <Button onClick={handleNewEstimate} size="sm" className="mt-3 bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                <Plus className="w-4 h-4 mr-1" /> Create First Estimate
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredEstimates.map((est: any) => (
                <div key={est.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl px-4 py-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/estimates/${est.id}`} className="font-semibold text-sm text-[#3d3d1e] hover:underline truncate">
                        {est.title || est.estimate_number || 'Untitled'}
                      </Link>
                      <Badge className={`text-[10px] ${STATUS_COLORS[est.status] ?? ''}`}>{est.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#7A7560] flex-wrap">
                      {est.estimate_number && <span>{est.estimate_number}</span>}
                      {est.client_name && <span>· {est.client_name}</span>}
                      {est.project_name && <span>· {est.project_name}</span>}
                      {est.created_at && <span>· {format(new Date(est.created_at), 'MMM d, yyyy')}</span>}
                    </div>
                  </div>
                  {est.grand_total ? (
                    <span className="font-semibold text-sm text-[#3d3d1e] shrink-0">{fmt(est.grand_total)}</span>
                  ) : null}
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Link href={`/dashboard/estimates/${est.id}`}>
                      <button className="p-1.5 rounded hover:bg-[#D4CFBA] text-[#7A7560]"><Pencil className="w-3.5 h-3.5" /></button>
                    </Link>
                    <button onClick={() => setDeleteTarget(est)} className="p-1.5 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="change-orders">
          {loadingCOs ? (
            <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>
          ) : filteredCOs.length === 0 ? (
            <div className="text-center py-16 text-[#7A7560]">
              <GitBranch className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No change orders yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredCOs.map((co: any) => (
                <div key={co.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl px-4 py-3 group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/dashboard/change-orders/${co.id}`} className="font-semibold text-sm text-[#3d3d1e] hover:underline truncate">
                        {co.title || co.change_order_number || 'Untitled CO'}
                      </Link>
                      <Badge className={`text-[10px] ${CO_STATUS_COLORS[co.status] ?? ''}`}>{co.status}</Badge>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-[#7A7560] flex-wrap">
                      {co.client_name && <span>{co.client_name}</span>}
                      {co.project_name && <span>· {co.project_name}</span>}
                      {co.change_order_total && <span>· CO: {fmt(co.change_order_total)}</span>}
                      {co.new_contract_total && <span>· New total: {fmt(co.new_contract_total)}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Link href={`/dashboard/change-orders/${co.id}`}>
                      <button className="p-1.5 rounded hover:bg-[#D4CFBA] text-[#7A7560]"><Pencil className="w-3.5 h-3.5" /></button>
                    </Link>
                    <button onClick={() => setDeleteCOTarget(co)} className="p-1.5 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!deleteTarget} onOpenChange={v => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete estimate?</AlertDialogTitle>
            <AlertDialogDescription>Delete &quot;{deleteTarget?.title || deleteTarget?.estimate_number}&quot;? This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteCOTarget} onOpenChange={v => !v && setDeleteCOTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete change order?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCO} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
