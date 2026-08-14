import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { format, parseISO } from 'date-fns';
import { Eye, FileText, DollarSign, Calendar, Trash2, TrendingUp, Pencil } from 'lucide-react';
import { useState } from 'react';
import BidDetailModal from './BidDetailModal';
import BidRequestFormDialog from './BidRequestFormDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const STATUS_COLORS = {
  draft: 'bg-muted text-muted-foreground',
  sent: 'bg-blue-100 text-blue-700',
  reviewing: 'bg-yellow-100 text-yellow-700',
  awarded: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

const PAYMENT_STATUS = {
  approved:     { label: 'Awarded',         cls: 'bg-green-100 text-green-700' },
  completed:    { label: 'Work Complete',   cls: 'bg-purple-100 text-purple-700' },
  partial_paid: { label: 'Partially Paid',  cls: 'bg-amber-100 text-amber-700' },
  paid:         { label: 'Paid',            cls: 'bg-emerald-100 text-emerald-700' },
};

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function BidRequestsList({ statusFilter, onRefresh, showAccepted = false }) {
  const [viewingBid, setViewingBid] = useState(null);
  const [editingBid, setEditingBid] = useState(null);
  const [deletingBid, setDeletingBid] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const isAwarded = deletingBid?.status === 'awarded';

  const handleDelete = async () => {
    if (isAwarded) {
      // Cancel awarded bid: notify subcontractor, delete tasks, mark cancelled
      setCancelling(true);
      await base44.functions.invoke('subContractorBid', { mode: 'cancel_awarded_bid', bidRequestId: deletingBid.id });
      setCancelling(false);
    } else {
      await base44.entities.BidRequest.delete(deletingBid.id);
    }
    setDeletingBid(null);
    onRefresh();
  };

  const { data: bidRequests = [] } = useQuery({
    queryKey: ['bid-requests'],
    queryFn: () => base44.entities.BidRequest.list('-created_date'),
  });

  const { data: submissions = [] } = useQuery({
    queryKey: ['bid-submissions'],
    queryFn: () => base44.entities.BidSubmission.list('-created_date'),
  });

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: () => base44.entities.SubContractor.list(),
  });

  const { data: changeOrders = [] } = useQuery({
    queryKey: ['change-orders'],
    queryFn: () => base44.entities.ChangeOrder.list(),
  });

  const filtered = bidRequests.filter(br => statusFilter.includes(br.status));

  if (filtered.length === 0) {
    return (
      <div className="text-center py-16 text-muted-foreground">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">{showAccepted ? 'No accepted bids yet' : 'No bid requests'}</p>
        <p className="text-sm mt-1">{showAccepted ? 'Approved bids will appear here.' : 'Create a bid request to invite sub-contractors to submit bids.'}</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {filtered.map(br => {
          const brSubs = (br.sub_contractor_ids || []).map(id => subs.find(s => s.id === id)).filter(Boolean);
          const brSubmissions = submissions.filter(s => s.bid_request_id === br.id);
          const approvedBid = brSubmissions.find(s => s.status === 'approved');
          const approvedChangeOrders = approvedBid
            ? changeOrders.filter(co => co.bid_submission_id === approvedBid.id && co.status === 'approved')
            : [];
          const changeOrderTotal = approvedChangeOrders.reduce((sum, co) => sum + (co.amount || 0), 0);
          const totalAmount = (approvedBid?.bid_amount || 0) + changeOrderTotal;

          return (
            <div key={br.id} className="bg-card border border-border rounded-xl p-3 md:p-4">
              {/* Title row + buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <h3 className="font-semibold flex-1 min-w-0 break-words sm:truncate" style={{ fontSize: 15 }}>{br.title}</h3>
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setViewingBid(br)} className="h-7 px-2 md:px-3 text-[11px]">
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setEditingBid(br)} className="h-7 px-2 md:px-3 text-[11px]">
                    <Pencil className="w-3 h-3 mr-1" /> Edit
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" onClick={() => setDeletingBid(br)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Status + project + address */}
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <Badge className={`text-[10px] ${STATUS_COLORS[br.status] || ''}`}>{br.status}</Badge>
                <span className="text-xs text-muted-foreground">{br.project_name}</span>
                {br.project_address && <span className="text-xs text-muted-foreground">📍 {br.project_address}</span>}
              </div>

              {/* Stats row, inline with dots */}
              <div className="flex items-center gap-1 mt-1.5 text-xs text-muted-foreground flex-wrap">
                <span>{brSubs.length} contractor{brSubs.length !== 1 ? 's' : ''} invited</span>
                <span className="opacity-40">·</span>
                <span>{brSubmissions.length} bid{brSubmissions.length !== 1 ? 's' : ''} received</span>
                {(br.scope_of_work || []).length > 0 && (
                  <>
                    <span className="opacity-40">·</span>
                    <span>{br.scope_of_work.length} scope items</span>
                  </>
                )}
              </div>

              {showAccepted && approvedBid && (() => {
                const payStatus = PAYMENT_STATUS[approvedBid.status] || PAYMENT_STATUS.approved;
                const paidSoFar = approvedBid.paid_amount || 0;
                const remaining = totalAmount - paidSoFar;
                const isPartial = approvedBid.status === 'partial_paid';
                const isPaid = approvedBid.status === 'paid';
                return (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] ${payStatus.cls}`}>{payStatus.label}</Badge>
                      <span className="flex items-center gap-1 text-green-700 font-medium text-sm">
                        <DollarSign className="w-3.5 h-3.5" />{fmt(totalAmount)}
                        {changeOrderTotal > 0 && (
                          <span className="flex items-center gap-0.5 text-xs text-amber-600 font-normal ml-1">
                            <TrendingUp className="w-3 h-3" />
                            +{fmt(changeOrderTotal)} ({approvedChangeOrders.length} CO)
                          </span>
                        )}
                      </span>
                      {approvedBid.estimated_start_date && (
                        <span className="flex items-center gap-1 text-muted-foreground text-xs">
                          <Calendar className="w-3.5 h-3.5" />
                          {format(parseISO(approvedBid.estimated_start_date), 'MMM d')}
                          {approvedBid.estimated_end_date && ` - ${format(parseISO(approvedBid.estimated_end_date), 'MMM d, yyyy')}`}
                        </span>
                      )}
                    </div>
                    {isPartial && (
                      <div className="flex items-center gap-3 text-xs bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                        <span className="text-amber-700"><span className="font-semibold">{fmt(paidSoFar)}</span> paid</span>
                        <span className="text-muted-foreground opacity-40">·</span>
                        <span className="text-amber-700"><span className="font-semibold">{fmt(remaining)}</span> still owed</span>
                      </div>
                    )}
                    {isPaid && (
                      <div className="text-xs text-emerald-700 font-medium">
                        Paid in full{approvedBid.paid_at ? ` · ${new Date(approvedBid.paid_at).toLocaleDateString()}` : ''}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground">Awarded to: <strong>{br.awarded_to_name}</strong></div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {viewingBid && (
        <BidDetailModal
          bidRequest={viewingBid}
          open={!!viewingBid}
          onOpenChange={v => !v && setViewingBid(null)}
          onRefresh={onRefresh}
        />
      )}

      {editingBid && (
        <BidRequestFormDialog
          open={!!editingBid}
          onOpenChange={v => !v && setEditingBid(null)}
          bidRequest={editingBid}
          onSaved={() => { setEditingBid(null); onRefresh(); }}
        />
      )}

      <AlertDialog open={!!deletingBid} onOpenChange={v => !v && setDeletingBid(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{isAwarded ? 'Cancel Awarded Work?' : 'Delete Bid Request'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {isAwarded ? (
                  <>
                    <p>This bid has already been awarded to <strong className="text-foreground">{deletingBid?.awarded_to_name}</strong>.</p>
                    <p>Cancelling will:</p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li>Email the subcontractor that the work is no longer needed</li>
                      <li>Delete all tasks linked to this bid</li>
                      <li>Mark the bid as cancelled</li>
                    </ul>
                  </>
                ) : (
                  <p>Are you sure you want to delete "<strong className="text-foreground">{deletingBid?.title}</strong>"? This cannot be undone.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelling}>Go Back</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={cancelling} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {cancelling ? 'Processing...' : isAwarded ? 'Yes, Cancel & Notify' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}