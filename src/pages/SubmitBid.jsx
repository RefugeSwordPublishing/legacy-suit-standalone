import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Square, DollarSign, Calendar, FileText, CheckCircle, ClipboardCheck } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function SubmitBid() {
  const params = new URLSearchParams(window.location.search);
  const bidRequestId = params.get('bidRequestId');
  const subId = params.get('subId');
  const mode = params.get('mode'); // 'schedule' | 'approve_estimate'

  const isEstimateApproval = mode === 'approve_estimate';
  const isScheduleConfirm = mode === 'schedule';

  const [bidRequest, setBidRequest] = useState(null);
  const [sub, setSub] = useState(null);
  const [existingBid, setExistingBid] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [bidAmount, setBidAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [notes, setNotes] = useState('');
  const [declining, setDeclining] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [declined, setDeclined] = useState(false);

  const callPublicFunction = async (payload) => {
    const res = await fetch(`${window.location.origin}/functions/subContractorBid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.json();
  };

  useEffect(() => {
    if (!bidRequestId || !subId) { setLoading(false); return; }
    callPublicFunction({ mode: 'get_bid_data', bidRequestId, subId })
      .then(data => {
        if (data?.bidRequest) setBidRequest(data.bidRequest);
        if (data?.sub) setSub(data.sub);
        if (data?.existingBid) {
          setExistingBid(data.existingBid);
          setBidAmount(data.existingBid.bid_amount?.toString() || '');
          setStartDate(data.existingBid.estimated_start_date || '');
          setEndDate(data.existingBid.estimated_end_date || '');
          setNotes(data.existingBid.notes || '');
        }
      })
      .finally(() => setLoading(false));
  }, [bidRequestId, subId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    let submitMode;
    if (isEstimateApproval) {
      submitMode = 'approve_estimate';
    } else if (isScheduleConfirm) {
      submitMode = 'confirm_schedule';
    } else {
      submitMode = 'submit_bid';
    }

    await callPublicFunction({
      mode: submitMode,
      bidRequestId,
      subContractorId: subId,
      bidAmount: isEstimateApproval ? undefined : (parseFloat(bidAmount) || null),
      estimatedStartDate: startDate,
      estimatedEndDate: isEstimateApproval ? startDate : endDate,
      notes,
    });
    setSaving(false);
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!bidRequestId || !subId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Invalid link.</p>
      </div>
    );
  }

  const handleDecline = async () => {
    setSaving(true);
    await callPublicFunction({
      mode: 'decline_estimate',
      bidRequestId,
      subContractorId: subId,
      reason: declineReason,
    });
    setSaving(false);
    setDeclined(true);
  };

  if (declined) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold font-butler">Estimate Declined</h2>
          <p className="text-muted-foreground">
            Legacy Renovations has been notified of your decision. Thank you for your response.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold font-butler">
            {isEstimateApproval ? 'Estimate Approved!' : isScheduleConfirm ? 'Schedule Confirmed!' : 'Bid Submitted!'}
          </h2>
          <p className="text-muted-foreground">
            {isEstimateApproval
              ? 'Thank you for approving the estimate. Legacy Renovations has been notified and will be in touch to finalize the details.'
              : isScheduleConfirm
              ? 'Your work schedule has been confirmed. We look forward to working with you.'
              : 'Thank you for your bid. We will review it and be in touch shortly.'}
          </p>
        </div>
      </div>
    );
  }

  const windowStart = bidRequest?.eta_window_start;
  const windowEnd = bidRequest?.eta_window_end;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground px-6 py-5">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <img
            src="https://media.base44.com/images/public/69d4420172cf85cc1afabd4c/0574d129b_Light_OliveBack_Square.png"
            alt="Legacy Renovations"
            className="w-10 h-10 rounded-full object-cover"
          />
          <div>
            <h1 className="font-bold font-butler text-lg">Legacy Renovations</h1>
            <p className="text-xs opacity-70">Sub-Contractor Portal</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Bid Request Info */}
        {bidRequest ? (
          <div className="bg-card border border-border rounded-xl p-5 space-y-4">
            <div className="flex items-start gap-2">
              {isEstimateApproval && <ClipboardCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />}
              <div>
                <h2 className="text-xl font-bold font-butler">{bidRequest.title}</h2>
                {isEstimateApproval && (
                  <p className="text-sm text-primary font-medium mt-0.5">Estimate for Your Approval</p>
                )}
              </div>
            </div>

            {bidRequest.project_address && (
              <p className="text-sm text-muted-foreground">📍 {bidRequest.project_address}</p>
            )}

            {/* Preset amount, shown for estimate approvals */}
            {isEstimateApproval && bidRequest.budget && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">Predetermined Estimate</p>
                <p className="text-3xl font-bold text-primary">${Number(bidRequest.budget).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">This amount has been set by Legacy Renovations.</p>
              </div>
            )}

            {bidRequest.description && (
              <p className="text-sm">{bidRequest.description}</p>
            )}

            {/* Scope of Work */}
            {(bidRequest.scope_of_work || []).length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2 flex items-center gap-1">
                  <FileText className="w-4 h-4" /> Scope of Work
                </h3>
                <ul className="space-y-1.5">
                  {bidRequest.scope_of_work.map((item) => (
                    <li key={item.id} className="flex items-start gap-2 text-sm">
                      <Square className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                      {item.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Scheduling window info */}
            {isEstimateApproval && windowStart && windowEnd && (
              <div className="bg-muted/50 border border-border rounded-lg px-4 py-3 flex items-start gap-2">
                <Calendar className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium">Scheduling Window</p>
                  <p className="text-sm text-muted-foreground">
                    {format(parseISO(windowStart), 'MMMM d, yyyy')} - {format(parseISO(windowEnd), 'MMMM d, yyyy')}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Please select your preferred start date within this range below.</p>
                </div>
              </div>
            )}

            {/* Photos */}
            {(bidRequest.photo_urls || []).length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Project Photos</h3>
                <div className="grid grid-cols-2 gap-2">
                  {bidRequest.photo_urls.map((url, i) => (
                    <img key={i} src={url} alt={`Photo ${i + 1}`} className="rounded-lg w-full h-32 object-cover border border-border" />
                  ))}
                </div>
              </div>
            )}

            {/* Files */}
            {(bidRequest.file_urls || []).length > 0 && (
              <div>
                <h3 className="font-semibold text-sm mb-2">Documents</h3>
                <div className="space-y-1">
                  {bidRequest.file_urls.map((url, i) => (
                    <a key={i} href={url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <FileText className="w-4 h-4" />
                      {(bidRequest.file_names || [])[i] || `Document ${i + 1}`}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-card border border-border rounded-xl p-5">
            <p className="text-muted-foreground text-sm">Loading details...</p>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-base">
            {isEstimateApproval ? 'Approve Estimate & Select Start Date' : isScheduleConfirm ? 'Confirm Your Work Schedule' : 'Submit Your Bid'}
          </h3>

          {/* Bid amount, only for regular bids */}
          {!isEstimateApproval && !isScheduleConfirm && (
            <div>
              <Label className="flex items-center gap-1 mb-1.5">
                <DollarSign className="w-3.5 h-3.5" /> Bid Amount (USD)
              </Label>
              <Input
                type="number" min="0" step="0.01" placeholder="0.00"
                value={bidAmount}
                onChange={e => setBidAmount(e.target.value)}
                required
              />
            </div>
          )}

          {/* Start date */}
          <div>
            <Label className="flex items-center gap-1 mb-1.5">
              <Calendar className="w-3.5 h-3.5" />
              {isEstimateApproval ? 'Your Preferred Start Date' : 'Estimated Start Date'}
            </Label>
            <Input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              min={isEstimateApproval && windowStart ? windowStart : undefined}
              max={isEstimateApproval && windowEnd ? windowEnd : undefined}
              required
            />
            {isEstimateApproval && windowStart && windowEnd && (
              <p className="text-xs text-muted-foreground mt-1">
                Must be between {format(parseISO(windowStart), 'MMM d')} and {format(parseISO(windowEnd), 'MMM d, yyyy')}
              </p>
            )}
          </div>

          {/* End date, not needed for estimate approvals */}
          {!isEstimateApproval && (
            <div>
              <Label className="flex items-center gap-1 mb-1.5">
                <Calendar className="w-3.5 h-3.5" /> Estimated End Date
              </Label>
              <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </div>
          )}

          <div>
            <Label className="mb-1.5 block">Notes / Comments</Label>
            <Textarea
              placeholder="Any additional details, questions, or comments…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          <Button type="submit" className="w-full" disabled={saving}>
            {saving
              ? 'Submitting...'
              : isEstimateApproval
              ? 'Approve Estimate'
              : isScheduleConfirm
              ? 'Confirm Schedule'
              : 'Submit Bid'}
          </Button>
        </form>

        {/* Decline option, estimate approvals only */}
        {isEstimateApproval && (
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            {!declining ? (
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-3">Not able to accept this estimate?</p>
                <Button variant="outline" className="text-destructive border-destructive/40 hover:bg-destructive/5 hover:text-destructive" onClick={() => setDeclining(true)}>
                  Decline Estimate
                </Button>
              </div>
            ) : (
              <>
                <h3 className="font-semibold text-sm text-destructive">Decline Estimate</h3>
                <div>
                  <Label className="mb-1.5 block text-sm">Reason for declining <span className="text-muted-foreground font-normal">(optional)</span></Label>
                  <Textarea
                    placeholder="e.g. Pricing is too low for the scope of work..."
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={3}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setDeclining(false)} disabled={saving}>
                    Go Back
                  </Button>
                  <Button className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={handleDecline} disabled={saving}>
                    {saving ? 'Submitting...' : 'Confirm Decline'}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}