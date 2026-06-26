'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Eye, FileText, DollarSign, Calendar, Trash2, TrendingUp, Pencil, Loader2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import BidDetailModal from './BidDetailModal'
import BidRequestFormDialog from './BidRequestFormDialog'

const STATUS_COLORS: Record<string, string> = {
  draft:     'bg-muted text-muted-foreground',
  sent:      'bg-blue-100 text-blue-700',
  reviewing: 'bg-yellow-100 text-yellow-700',
  awarded:   'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
}

const PAYMENT_STATUS: Record<string, { label: string; cls: string }> = {
  approved:     { label: 'Awarded',        cls: 'bg-green-100 text-green-700' },
  completed:    { label: 'Work Complete',  cls: 'bg-purple-100 text-purple-700' },
  partial_paid: { label: 'Partially Paid', cls: 'bg-amber-100 text-amber-700' },
  paid:         { label: 'Paid',           cls: 'bg-emerald-100 text-emerald-700' },
}

function fmt(n: number) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

interface Props {
  statusFilter: string[]
  showAccepted?: boolean
  onRefresh: () => void
}

export default function BidRequestsList({ statusFilter, showAccepted = false, onRefresh }: Props) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [viewingBid, setViewingBid] = useState<any>(null)
  const [editingBid, setEditingBid] = useState<any>(null)
  const [deletingBid, setDeletingBid] = useState<any>(null)

  const { data: bidRequests = [], isLoading } = useQuery({
    queryKey: ['bid-requests'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_requests').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ['bid-submissions'],
    queryFn: async () => {
      const { data } = await supabase.from('bid_submissions').select('*')
      return data ?? []
    },
  })

  const { data: changeOrders = [] } = useQuery({
    queryKey: ['sub-change-orders-all'],
    queryFn: async () => {
      const { data } = await supabase.from('sub_change_orders').select('*')
      return data ?? []
    },
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['bid-requests'] })
    qc.invalidateQueries({ queryKey: ['bid-submissions'] })
    onRefresh()
  }

  const handleDelete = async () => {
    if (!deletingBid) return
    await supabase.from('bid_requests').delete().eq('id', deletingBid.id)
    toast.success('Bid request deleted')
    setDeletingBid(null)
    refresh()
  }

  const filtered = (bidRequests as any[]).filter(br => statusFilter.includes(br.status))

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>

  if (filtered.length === 0) return (
    <div className="text-center py-16 text-[#7A7560]">
      <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium">{showAccepted ? 'No accepted bids yet' : 'No bid requests'}</p>
      <p className="text-sm mt-1">{showAccepted ? 'Approved bids will appear here.' : 'Create a bid request to invite sub-contractors.'}</p>
    </div>
  )

  return (
    <>
      <div className="space-y-3">
        {filtered.map(br => {
          const brSubmissions = (submissions as any[]).filter(s => s.bid_request_id === br.id)
          const approvedBid = brSubmissions.find(s => ['approved', 'completed', 'partial_paid', 'paid'].includes(s.status))
          const approvedCOs = approvedBid
            ? (changeOrders as any[]).filter(co => co.bid_submission_id === approvedBid.id)
            : []
          const changeOrderTotal = approvedCOs.reduce((s: number, co: any) => s + (Number(co.amount) || 0), 0)
          const totalAmount = (approvedBid?.bid_amount || 0) + changeOrderTotal
          const payStatus = approvedBid ? PAYMENT_STATUS[approvedBid.status] : null
          const paidSoFar = approvedBid?.paid_amount || 0

          return (
            <div key={br.id} className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-3 md:p-4">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold flex-1 min-w-0 truncate text-[#3d3d1e]" style={{ fontSize: 15 }}>{br.title}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setViewingBid(br)} className="h-7 px-2 text-[11px]">
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingBid(br)} className="h-7 px-2 text-[11px]">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeletingBid(br)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge className={`text-[10px] ${STATUS_COLORS[br.status] || ''}`}>{br.status}</Badge>
                <span className="text-xs text-[#7A7560]">{br.project_name}</span>
                {br.project_address && <span className="text-xs text-[#7A7560]">📍 {br.project_address}</span>}
              </div>

              <div className="flex items-center gap-1 mt-1.5 text-xs text-[#7A7560] flex-wrap">
                <span>{brSubmissions.length} bid{brSubmissions.length !== 1 ? 's' : ''} received</span>
                {(br.scope_of_work || []).length > 0 && (
                  <><span className="opacity-40">·</span><span>{br.scope_of_work.length} scope items</span></>
                )}
              </div>

              {showAccepted && approvedBid && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    {payStatus && <Badge className={`text-[10px] ${payStatus.cls}`}>{payStatus.label}</Badge>}
                    <span className="flex items-center gap-1 text-green-700 font-medium text-sm">
                      <DollarSign className="w-3.5 h-3.5" />{fmt(totalAmount)}
                      {changeOrderTotal > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-600 font-normal ml-1">
                          <TrendingUp className="w-3 h-3" />+{fmt(changeOrderTotal)} ({approvedCOs.length} CO)
                        </span>
                      )}
                    </span>
                    {approvedBid.estimated_start_date && (
                      <span className="flex items-center gap-1 text-[#7A7560] text-xs">
                        <Calendar className="w-3.5 h-3.5" />
                        {format(parseISO(approvedBid.estimated_start_date), 'MMM d')}
                        {approvedBid.estimated_end_date && ` – ${format(parseISO(approvedBid.estimated_end_date), 'MMM d, yyyy')}`}
                      </span>
                    )}
                  </div>
                  {approvedBid.status === 'partial_paid' && (
                    <div className="flex items-center gap-3 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <span className="text-amber-700"><span className="font-semibold">{fmt(paidSoFar)}</span> paid</span>
                      <span className="text-[#7A7560] opacity-40">·</span>
                      <span className="text-amber-700"><span className="font-semibold">{fmt(totalAmount - paidSoFar)}</span> still owed</span>
                    </div>
                  )}
                  {approvedBid.status === 'paid' && (
                    <p className="text-xs text-emerald-700 font-medium">
                      Paid in full{approvedBid.paid_at ? ` · ${new Date(approvedBid.paid_at).toLocaleDateString()}` : ''}
                    </p>
                  )}
                  {br.awarded_to_name && <p className="text-xs text-[#7A7560]">Awarded to: <strong>{br.awarded_to_name}</strong></p>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {viewingBid && (
        <BidDetailModal bidRequest={viewingBid} open={!!viewingBid} onOpenChange={v => !v && setViewingBid(null)} onRefresh={refresh} />
      )}

      {editingBid && (
        <BidRequestFormDialog open={!!editingBid} onOpenChange={v => !v && setEditingBid(null)} bidRequest={editingBid} onSaved={() => { setEditingBid(null); refresh() }} />
      )}

      <AlertDialog open={!!deletingBid} onOpenChange={v => !v && setDeletingBid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Bid Request</AlertDialogTitle>
            <AlertDialogDescription>
              Delete &quot;{deletingBid?.title}&quot;? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
