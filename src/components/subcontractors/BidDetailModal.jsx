import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Send, CheckCircle, DollarSign, Calendar, FileText, Square, User, PlusCircle, ClipboardCheck, Gavel } from 'lucide-react';
import SignedImage from '@/components/shared/SignedImage';
import { format, parseISO } from 'date-fns';
import { toast } from 'sonner';
import ChangeOrderDialog from './ChangeOrderDialog';
import ManualApproveDialog from './ManualApproveDialog';
import PartialPaymentDialog from './PartialPaymentDialog';

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const STATUS_COLORS = {
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  completed: 'bg-purple-100 text-purple-700',
  partial_paid: 'bg-amber-100 text-amber-700',
  paid: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
};

export default function BidDetailModal({ bidRequest, open, onOpenChange, onRefresh }) {
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(null);
  const [completing, setCompleting] = useState(null);
  const [paying, setPaying] = useState(null);
  const [paymentDialogSubmission, setPaymentDialogSubmission] = useState(null);
  const [changeOrderSubmission, setChangeOrderSubmission] = useState(null);
  const [manualApproveOpen, setManualApproveOpen] = useState(false);
  const qc = useQueryClient();

  // Re-fetch the bid request itself so photos/data are always fresh
  const { data: freshBidRequest } = useQuery({
    queryKey: ['bid-request-detail', bidRequest?.id],
    queryFn: () => base44.entities.BidRequest.get(bidRequest.id),
    enabled: !!bidRequest?.id && open,
  });
  const br = freshBidRequest || bidRequest;
  const isEstimate = br?.request_type === 'estimate';

  const { data: submissions = [] } = useQuery({
    queryKey: ['bid-submissions', bidRequest?.id],
    queryFn: () => base44.entities.BidSubmission.filter({ bid_request_id: bidRequest.id }),
    enabled: !!bidRequest?.id,
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ['change-orders', bidRequest?.id],
    queryFn: () => base44.entities.ChangeOrder.filter({ bid_request_id: bidRequest.id }),
    enabled: !!bidRequest?.id,
  });

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: () => base44.entities.SubContractor.list(),
  });

  const invitedSubs = (br?.sub_contractor_ids || []).map(id => subs.find(s => s.id === id)).filter(Boolean);

  const handleSendBids = async () => {
    setSending(true);
    const mode = isEstimate ? 'send_estimate_request' : 'send_bid_request';
    await base44.functions.invoke('subContractorBid', { mode, bidRequestId: bidRequest.id });
    setSending(false);
    toast.success(isEstimate ? 'Estimate sent for approval!' : 'Bid requests sent!');
    onRefresh();
    qc.invalidateQueries({ queryKey: ['bid-requests'] });
  };

  const handleApprove = async (submission) => {
    setApproving(submission.id);
    try {
      // Approve this bid and award the request. (The old subContractorBid edge fn was a stub that
      // never changed status, so approvals silently stuck at 'submitted'.)
      await base44.entities.BidSubmission.update(submission.id, { status: 'approved' });
      await base44.entities.BidRequest.update(bidRequest.id, { status: 'awarded' });

      let emailed = false;
      if (submission.sub_contractor_email) {
        try {
          const amt = submission.bid_amount ? ` of $${Number(submission.bid_amount).toLocaleString()}` : '';
          await base44.functions.invoke('sendEmail', {
            to: submission.sub_contractor_email,
            subject: `Your bid was approved — ${br?.title || 'Project'}`,
            html: `<p>Good news — your bid${amt} for <strong>${br?.title || 'the project'}</strong>${br?.project_address ? ` at ${br.project_address}` : ''} has been approved.</p><p>We will be in touch with next steps.</p>`,
          });
          emailed = true;
        } catch { /* email is best-effort; the approval still stands */ }
      }
      toast.success(emailed ? 'Bid approved. Contractor notified by email.' : 'Bid approved.');
      onRefresh();
      qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] });
      qc.invalidateQueries({ queryKey: ['bid-requests'] });
    } catch (e) {
      toast.error(e?.message || 'Could not approve the bid. Please try again.');
    } finally {
      setApproving(null);
    }
  };

  const handleMarkCompleted = async (submission) => {
    setCompleting(submission.id);
    await base44.entities.BidSubmission.update(submission.id, {
      status: 'completed',
      work_completed_at: new Date().toISOString(),
    });
    setCompleting(null);
    toast.success('Work marked as completed.');
    qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] });
  };

  const handleMarkPaid = async (submission) => {
    setPaying(submission.id);
    const paidAt = new Date().toISOString();
    await base44.entities.BidSubmission.update(submission.id, {
      status: 'paid',
      paid_at: paidAt,
    });
    await base44.functions.invoke('syncBidPaymentToSheets', { bidSubmissionId: submission.id });
    setPaying(null);
    toast.success('Marked as paid and synced to Google Sheets!');
    qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] });
    qc.invalidateQueries({ queryKey: ['bid-requests'] });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isEstimate
              ? <ClipboardCheck className="w-5 h-5 text-primary" />
              : <FileText className="w-5 h-5 text-primary" />}
            {br?.title}
            {isEstimate && (
              <span className="text-xs font-normal bg-primary/10 text-primary px-2 py-0.5 rounded-full ml-1">Estimate</span>
            )}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{br?.project_name} · {br?.project_address}</p>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="shrink-0">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="bids">{isEstimate ? 'Approval' : 'Bids'} ({submissions.length})</TabsTrigger>
          </TabsList>

          <div className="overflow-y-auto flex-1 mt-3">
            <TabsContent value="details" className="space-y-4 mt-0">
              {br?.budget && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg px-4 py-3 flex items-center gap-3">
                  <DollarSign className="w-4 h-4 text-primary shrink-0" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                      {isEstimate ? 'Preset Estimate Amount' : 'Internal Budget'}
                    </p>
                    <p className="text-base font-semibold text-primary">${Number(br.budget).toLocaleString()}</p>
                    {isEstimate && <p className="text-xs text-muted-foreground">Shown to contractor for approval</p>}
                  </div>
                </div>
              )}

              {/* Scheduling window for estimates */}
              {isEstimate && (br?.eta_window_start || br?.eta_window_end) && (
                <div className="bg-muted/40 border border-border rounded-lg px-4 py-3 flex items-start gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Scheduling Window</p>
                    <p className="text-sm font-medium">
                      {br.eta_window_start ? format(parseISO(br.eta_window_start), 'MMM d, yyyy') : '?'}
                      {' - '}
                      {br.eta_window_end ? format(parseISO(br.eta_window_end), 'MMM d, yyyy') : '?'}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">Contractor picks start date within this range</p>
                  </div>
                </div>
              )}

              {br?.description && (
                <p className="text-sm">{br.description}</p>
              )}

              {/* Scope of Work */}
              {(br?.scope_of_work || []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Scope of Work</h4>
                  <ul className="space-y-1.5">
                    {br.scope_of_work.map(item => (
                      <li key={item.id} className="flex items-center gap-2 text-sm">
                        <Square className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        {item.title}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Photos */}
              {(br?.photo_urls || []).length > 0 && (
                <div>
                  <h4 className="font-semibold text-sm mb-2">Photos</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {br.photo_urls.map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                        <SignedImage
                          src={url}
                          alt=""
                          className="rounded-lg h-24 w-full object-cover border hover:opacity-90 transition-opacity cursor-pointer"
                          fallback={
                            <div className="rounded-lg h-24 w-full border bg-muted flex items-center justify-center text-xs text-muted-foreground">
                              Image unavailable
                            </div>
                          }
                        />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Invited Contractors */}
              <div>
                <h4 className="font-semibold text-sm mb-2">Invited Contractors ({invitedSubs.length})</h4>
                {invitedSubs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contractors selected yet.</p>
                ) : (
                  <div className="space-y-1.5">
                    {invitedSubs.map(sub => (
                      <div key={sub.id} className="flex items-center gap-2 text-sm">
                        <User className="w-3.5 h-3.5 text-muted-foreground" />
                        <span>{sub.business_name || sub.contact_name}</span>
                        <span className="text-muted-foreground text-xs">· {sub.email}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Send / Resend Button */}
              {['draft', 'sent'].includes(br?.status) && invitedSubs.length > 0 && (
                <Button onClick={handleSendBids} disabled={sending} className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  {sending
                    ? 'Sending...'
                    : br?.status === 'sent'
                    ? isEstimate ? 'Resend Estimate' : 'Resend Bid Requests'
                    : isEstimate ? 'Send Estimate for Approval' : 'Send Bid Requests'}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="bids" className="mt-0 space-y-3">
              {br?.status !== 'awarded' && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => setManualApproveOpen(true)}
                >
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                  Manually Approve a Contractor
                </Button>
              )}
              {submissions.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">No bids submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {submissions.map(sub => {
                    const contractor = subs.find(s => s.id === sub.sub_contractor_id);
                    return (
                      <div key={sub.id} className="border border-border rounded-xl p-4 space-y-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold">{sub.sub_contractor_name}</p>
                            <p className="text-xs text-muted-foreground">{sub.sub_contractor_email}</p>
                          </div>
                          <Badge className={`text-xs ${STATUS_COLORS[sub.status] || ''}`}>{sub.status}</Badge>
                        </div>

                        <div className="flex items-center gap-4 text-sm flex-wrap">
                          {sub.bid_amount && (
                            <span className="flex items-center gap-1 font-semibold text-green-700">
                              <DollarSign className="w-3.5 h-3.5" />${sub.bid_amount.toLocaleString()}
                              {br?.budget && (
                                <span className={`ml-1 text-xs font-normal px-1.5 py-0.5 rounded-full ${sub.bid_amount <= br.budget ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                                  {sub.bid_amount <= br.budget
                                    ? `$${(br.budget - sub.bid_amount).toLocaleString()} under budget`
                                    : `$${(sub.bid_amount - br.budget).toLocaleString()} over budget`}
                                </span>
                              )}
                            </span>
                          )}
                          {sub.estimated_start_date && (
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <Calendar className="w-3.5 h-3.5" />
                              {format(parseISO(sub.estimated_start_date), 'MMM d')}
                              {sub.estimated_end_date && ` - ${format(parseISO(sub.estimated_end_date), 'MMM d, yyyy')}`}
                            </span>
                          )}
                        </div>

                        {sub.notes && <p className="text-sm text-muted-foreground">{sub.notes}</p>}

                        {sub.status === 'submitted' && br?.status !== 'awarded' && (
                          <Button
                            size="sm"
                            className="w-full bg-green-600 hover:bg-green-700 text-white"
                            disabled={approving === sub.id}
                            onClick={() => handleApprove(sub)}
                          >
                            <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                            {approving === sub.id ? 'Approving...' : 'Approve This Bid'}
                          </Button>
                        )}

                        {['approved', 'completed', 'partial_paid', 'paid'].includes(sub.status) && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5 text-green-700 text-sm font-medium">
                              <CheckCircle className="w-4 h-4" /> Approved & Awarded
                            </div>

                            {/* Change orders */}
                            {changeOrders.filter(co => co.bid_submission_id === sub.id).map(co => (
                              <div key={co.id} className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2 text-sm">
                                <PlusCircle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                <span className="flex-1 text-muted-foreground">{co.description || 'Change order'}</span>
                                <span className="font-semibold text-foreground">+${Number(co.amount).toLocaleString()}</span>
                              </div>
                            ))}

                            {sub.status === 'approved' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="w-full"
                                  onClick={() => setChangeOrderSubmission(sub)}
                                >
                                  <PlusCircle className="w-3.5 h-3.5 mr-1.5" />
                                  Add Change Order
                                </Button>
                                <Button
                                  size="sm"
                                  className="w-full bg-purple-600 hover:bg-purple-700 text-white"
                                  disabled={completing === sub.id}
                                  onClick={() => handleMarkCompleted(sub)}
                                >
                                  <CheckCircle className="w-3.5 h-3.5 mr-1.5" />
                                  {completing === sub.id ? 'Saving...' : 'Mark Work Completed'}
                                </Button>
                              </>
                            )}

                            {['completed', 'partial_paid'].includes(sub.status) && (() => {
                              const subCOs = changeOrders.filter(co => co.bid_submission_id === sub.id);
                              const coTotal = subCOs.reduce((s, co) => s + (Number(co.amount) || 0), 0);
                              const totalAmt = (sub.bid_amount || 0) + coTotal;
                              const paidSoFar = sub.paid_amount || 0;
                              const remaining = totalAmt - paidSoFar;
                              return (
                                <div className="space-y-2">
                                  {sub.status === 'completed' && (
                                    <div className="flex items-center gap-1.5 text-purple-700 text-sm font-medium">
                                      <CheckCircle className="w-4 h-4" /> Work Completed
                                      {sub.work_completed_at && (
                                        <span className="text-xs text-muted-foreground font-normal ml-1">
                                          {new Date(sub.work_completed_at).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  {sub.status === 'partial_paid' && (
                                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1">
                                      <div className="flex justify-between text-sm">
                                        <span className="text-amber-700 font-medium">Partially Paid</span>
                                        <span className="font-semibold">{fmt(paidSoFar)} / {fmt(totalAmt)}</span>
                                      </div>
                                      <div className="flex justify-between text-xs text-amber-600">
                                        <span>Still owed</span>
                                        <span className="font-semibold">{fmt(remaining)}</span>
                                      </div>
                                    </div>
                                  )}
                                  {/* Payment history */}
                                  {(sub.payments || []).length > 0 && (
                                    <div className="space-y-1">
                                      {sub.payments.map((p, i) => (
                                        <div key={i} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                                          <span>{new Date(p.date).toLocaleDateString()}{p.note ? `, ${p.note}` : ''}</span>
                                          <span className="font-medium text-foreground">{fmt(p.amount)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  <Button
                                    size="sm"
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                                    onClick={() => setPaymentDialogSubmission({ sub, totalAmt })}
                                  >
                                    <DollarSign className="w-3.5 h-3.5 mr-1.5" />
                                    Record Payment
                                  </Button>
                                </div>
                              );
                            })()}

                            {sub.status === 'paid' && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-700 text-sm font-medium bg-emerald-50 rounded-lg px-3 py-2">
                                  <DollarSign className="w-4 h-4" /> Paid in Full
                                  {sub.paid_at && (
                                    <span className="text-xs text-muted-foreground font-normal ml-1">
                                      {new Date(sub.paid_at).toLocaleDateString()}
                                    </span>
                                  )}
                                </div>
                                {(sub.payments || []).length > 0 && (
                                  <div className="space-y-1">
                                    {sub.payments.map((p, i) => (
                                      <div key={i} className="flex items-center justify-between text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
                                        <span>{new Date(p.date).toLocaleDateString()}{p.note ? `, ${p.note}` : ''}</span>
                                        <span className="font-medium text-foreground">{fmt(p.amount)}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>

    <ManualApproveDialog
      open={manualApproveOpen}
      onOpenChange={setManualApproveOpen}
      bidRequest={bidRequest}
      onApproved={() => {
        onRefresh();
        qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] });
        qc.invalidateQueries({ queryKey: ['bid-requests'] });
      }}
    />

    {paymentDialogSubmission && (
      <PartialPaymentDialog
        open={!!paymentDialogSubmission}
        onOpenChange={v => !v && setPaymentDialogSubmission(null)}
        submission={paymentDialogSubmission.sub}
        totalAmount={paymentDialogSubmission.totalAmt}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['bid-submissions', bidRequest.id] });
          qc.invalidateQueries({ queryKey: ['bid-requests'] });
          qc.invalidateQueries({ queryKey: ['bid-submissions'] });
          onRefresh();
        }}
      />
    )}

    {changeOrderSubmission && (
      <ChangeOrderDialog
        open={!!changeOrderSubmission}
        onOpenChange={v => !v && setChangeOrderSubmission(null)}
        bidRequest={bidRequest}
        submission={changeOrderSubmission}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ['change-orders', bidRequest.id] });
          toast.success('Change order added!');
        }}
      />
    )}
  </>
  );
}