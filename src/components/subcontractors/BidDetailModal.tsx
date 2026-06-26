'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Send, CheckCircle, DollarSign, Calendar, FileText, Square, User, PlusCircle, ClipboardCheck, Gavel } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { toast } from 'sonner'
import ChangeOrderDialog from './ChangeOrderDialog'
import ManualApproveDialog from './ManualApproveDialog'
import PartialPaymentDialog from './PartialPaymentDialog'

function fmt(n: number) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

const STATUS_COLORS: Record<string, string> = {
  submitted:    'bg-blue-100 text-blue-700',
  approved:     'bg-green-100 text-green-700',
  completed:    'bg-purple-100 text-purple-700',
  partial_paid: 'bg-amber-100 text-amber-700',
  paid:         'bg-emerald-100 text-emerald-700',
  declined:     'bg-red-100 text-red-700',
}

interface Props {
  bidRequest: any
  open: boolean
  onOpenChange: (v: boolean) => void
  onRefresh: () => void
}

export default function BidDetailModal({ bidRequest, open, onOpenChange, onRefresh }: Props) {
  const supabase = createClient()
  const qc = useQueryClient()
  const [completing, setCompleting] = useState<string | null>(null)
  const [approving, setApproving] = useState<string | null>(null)
  const [paymentDialogData, setPaymentDialogData] = useState<{ sub: any; totalAmt: number } | null>(null)
  const [changeOrderSubmission, setChangeOrderSubmission] = useState<any>(null)
  const [manualApproveOpen, setManualApproveOpen] = useState(false)

  const { data: br } = useQuery({
    queryKey: ['bid-request-detail', bidRequest?.id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_requests').select('*').eq('id', bidRequest.id).single()
      return data
    },
    enabled: !!bidRequest?.id && open,
    initialData: bidRequest,
  })

  const { data: submissions = [] } = useQuery({
    queryKey: ['bid-submissions', bidRequest?.id],
    queryFn: async () => {
      const { data } = await supabase.from('bid_submissions').select('*').eq('bid_request_id', bidRequest.id)
      return data ?? []
    },
    enabled: !!bidRequest?.id,
  })

  const { data: changeOrders = [] } = useQuery({
    queryKey: ['sub-change-orders', bidRequest?.id],
    queryFn: async () => {
      const { data } = await supabase.from('sub_change_orders').select('*').eq('bid_request_id', bidRequest.id)
      return data ?? []
    },
    enabled: !!bidRequest?.id,
  })

  const isEstimate = br?.request_type === 'estimate'
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] })
    qc.invalidateQueries({ queryKey: ['bid-requests'] })
    qc.invalidateQueries({ queryKey: ['sub-change-orders', bidRequest.id] })
    onRefresh()
  }

  const handleApprove = async (sub: any) => {
    setApproving(sub.id)
    await supabase.from('bid_submissions').update({ status: 'approved' }).eq('id', sub.id)
    await supabase.from('bid_requests').update({ status: 'awarded', awarded_to_name: sub.sub_contractor_name }).eq('id', bidRequest.id)
    toast.success('Bid approved')
    setApproving(null)
    invalidate()
  }

  const handleMarkCompleted = async (sub: any) => {
    setCompleting(sub.id)
    await supabase.from('bid_submissions').update({ status: 'completed', work_completed_at: new Date().toISOString() }).eq('id', sub.id)
    toast.success('Work marked as completed')
    setCompleting(null)
    invalidate()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isEstimate ? <ClipboardCheck className="w-5 h-5 text-[#3d3d1e]" /> : <FileText className="w-5 h-5 text-[#3d3d1e]" />}
              {br?.title}
              {isEstimate && <span className="text-xs font-normal bg-[#3d3d1e]/10 text-[#3d3d1e] px-2 py-0.5 rounded-full ml-1">Estimate</span>}
            </DialogTitle>
            <p className="text-sm text-[#7A7560]">{br?.project_name}{br?.project_address ? ` · ${br.project_address}` : ''}</p>
          </DialogHeader>

          <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
            <TabsList className="shrink-0">
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="bids">{isEstimate ? 'Approval' : 'Bids'} ({(submissions as any[]).length})</TabsTrigger>
            </TabsList>

            <div className="overflow-y-auto flex-1 mt-3">
              <TabsContent value="details" className="space-y-4 mt-0">
                {br?.budget && (
                  <div className="bg-[#3d3d1e]/5 border border-[#3d3d1e]/20 rounded-lg px-4 py-3 flex items-center gap-3">
                    <DollarSign className="w-4 h-4 text-[#3d3d1e] shrink-0" />
                    <div>
                      <p className="text-xs text-[#7A7560] font-medium uppercase tracking-wide">
                        {isEstimate ? 'Preset Estimate Amount' : 'Internal Budget'}
                      </p>
                      <p className="text-base font-semibold text-[#3d3d1e]">${Number(br.budget).toLocaleString()}</p>
                    </div>
                  </div>
                )}

                {isEstimate && (br?.eta_window_start || br?.eta_window_end) && (
                  <div className="bg-muted/40 border border-[#D4CFBA] rounded-lg px-4 py-3 flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-[#7A7560] shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs text-[#7A7560] font-medium uppercase tracking-wide mb-1">Scheduling Window</p>
                      <p className="text-sm font-medium">
                        {br.eta_window_start ? format(parseISO(br.eta_window_start), 'MMM d, yyyy') : '?'}
                        {' – '}
                        {br.eta_window_end ? format(parseISO(br.eta_window_end), 'MMM d, yyyy') : '?'}
                      </p>
                    </div>
                  </div>
                )}

                {br?.description && <p className="text-sm">{br.description}</p>}

                {(br?.scope_of_work || []).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-sm mb-2">Scope of Work</h4>
                    <ul className="space-y-1.5">
                      {br.scope_of_work.map((item: any) => (
                        <li key={item.id} className="flex items-center gap-2 text-sm">
                          <Square className="w-3.5 h-3.5 text-[#7A7560] shrink-0" />
                          {item.title}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="bids" className="mt-0 space-y-3">
                {br?.status !== 'awarded' && (
                  <Button size="sm" variant="outline" className="w-full border-green-300 text-green-700 hover:bg-green-50" onClick={() => setManualApproveOpen(true)}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                    Manually Approve a Contractor
                  </Button>
                )}

                {(submissions as any[]).length === 0 ? (
                  <p className="text-center text-[#7A7560] py-8 text-sm">No bids submitted yet.</p>
                ) : (
                  <div className="space-y-3">
                    {(submissions as any[]).map(sub => {
                      const subCOs = (changeOrders as any[]).filter(co => co.bid_submission_id === sub.id)
                      const coTotal = subCOs.reduce((s: number, co: any) => s + (Number(co.amount) || 0), 0)
                      const totalAmt = (sub.bid_amount || 0) + coTotal

                      return (
                        <div key={sub.id} className="border border-[#D4CFBA] rounded-xl p-4 space-y-2">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold">{sub.sub_contractor_name}</p>
                              <p className="text-xs text-[#7A7560]">{sub.sub_contractor_email}</p>
                            </div>
                            <Badge className={`text-xs ${STATUS_COLORS[sub.status] || ''}`}>{sub.status.replace('_', ' ')}</Badge>
                          </div>

                          {sub.bid_amount && (
                            <div className="flex items-center gap-2 text-sm flex-wrap">
                              <span className="flex items-center gap-1 font-semibold text-green-700">
                                <DollarSign className="w-3.5 h-3.5" />{fmt(sub.bid_amount)}
                              </span>
                              {coTotal > 0 && (
                                <span className="text-xs text-amber-600">+{fmt(coTotal)} ({subCOs.length} CO)</span>
                              )}
                              {coTotal > 0 && <span className="text-xs text-[#7A7560]">= {fmt(totalAmt)} total</span>}
                            </div>
                          )}

                          {/* Change orders */}
                          {subCOs.map((co: any) => (
                            <div key={co.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-sm">
                              <PlusCircle className="w-3.5 h-3.5 text-[#7A7560] shrink-0" />
                              <span className="flex-1 text-[#7A7560]">{co.description || 'Change order'}</span>
                              <span className="font-semibold">+{fmt(co.amount)}</span>
                            </div>
                          ))}

                          {sub.status === 'submitted' && br?.status !== 'awarded' && (
                            <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white" disabled={approving === sub.id} onClick={() => handleApprove(sub)}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                              {approving === sub.id ? 'Approving...' : 'Approve This Bid'}
                            </Button>
                          )}

                          {['approved', 'completed', 'partial_paid', 'paid'].includes(sub.status) && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                                <CheckCircle className="w-4 h-4" /> Approved & Awarded
                              </div>

                              {sub.status === 'approved' && (
                                <>
                                  <Button size="sm" variant="outline" className="w-full" onClick={() => setChangeOrderSubmission(sub)}>
                                    <PlusCircle className="w-3.5 h-3.5 mr-1.5" /> Add Change Order
                                  </Button>
                                  <Button size="sm" className="w-full bg-purple-600 hover:bg-purple-700 text-white" disabled={completing === sub.id} onClick={() => handleMarkCompleted(sub)}>
                                    <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                    {completing === sub.id ? 'Saving...' : 'Mark Work Completed'}
                                  </Button>
                                </>
                              )}

                              {['completed', 'partial_paid'].includes(sub.status) && (
                                <div className="space-y-2">
                                  {sub.status === 'completed' && (
                                    <p className="text-xs text-purple-700 font-medium flex items-center gap-1">
                                      <CheckCircle className="w-3.5 h-3.5" /> Work Completed
                                      {sub.work_completed_at && ` · ${new Date(sub.work_completed_at).toLocaleDateString()}`}
                                    </p>
                                  )}
                                  {sub.status === 'partial_paid' && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-amber-700 font-medium">Partially Paid</span>
                                        <span className="font-semibold">{fmt(sub.paid_amount)} / {fmt(totalAmt)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs text-amber-600">
                                        <span>Still owed</span>
                                        <span className="font-semibold">{fmt(totalAmt - sub.paid_amount)}</span>
                                      </div>
                                    </div>
                                  )}
                                  {(sub.payments || []).map((p: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-[#7A7560] bg-muted/30 rounded px-2 py-1">
                                      <span>{new Date(p.date).toLocaleDateString()}{p.note ? ` — ${p.note}` : ''}</span>
                                      <span className="font-medium text-foreground">{fmt(p.amount)}</span>
                                    </div>
                                  ))}
                                  <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => setPaymentDialogData({ sub, totalAmt })}>
                                    <DollarSign className="w-3.5 h-3.5 mr-1.5" /> Record Payment
                                  </Button>
                                </div>
                              )}

                              {sub.status === 'paid' && (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-medium bg-emerald-50 rounded-lg px-3 py-2">
                                    <DollarSign className="w-4 h-4" /> Paid in Full
                                    {sub.paid_at && <span className="text-xs text-[#7A7560] font-normal ml-1">{new Date(sub.paid_at).toLocaleDateString()}</span>}
                                  </div>
                                  {(sub.payments || []).map((p: any, i: number) => (
                                    <div key={i} className="flex justify-between text-xs text-[#7A7560] bg-muted/30 rounded px-2 py-1">
                                      <span>{new Date(p.date).toLocaleDateString()}{p.note ? ` — ${p.note}` : ''}</span>
                                      <span className="font-medium text-foreground">{fmt(p.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </DialogContent>
      </Dialog>

      <ManualApproveDialog open={manualApproveOpen} onOpenChange={setManualApproveOpen} bidRequest={bidRequest} onApproved={invalidate} />

      {paymentDialogData && (
        <PartialPaymentDialog
          open={!!paymentDialogData}
          onOpenChange={v => !v && setPaymentDialogData(null)}
          submission={paymentDialogData.sub}
          totalAmount={paymentDialogData.totalAmt}
          onSaved={invalidate}
        />
      )}

      {changeOrderSubmission && (
        <ChangeOrderDialog
          open={!!changeOrderSubmission}
          onOpenChange={v => !v && setChangeOrderSubmission(null)}
          bidRequest={bidRequest}
          submission={changeOrderSubmission}
          onSaved={() => { invalidate(); toast.success('Change order added') }}
        />
      )}
    </>
  )
}
