import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, X, Clock, CalendarOff, Plus } from 'lucide-react';

const HIGH_ROLES = ['owner', 'coo', 'admin'];

const statusConfig = {
  pending:  { label: 'Pending',  color: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Approved', color: 'bg-green-100 text-green-800' },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-800' },
};

function formatRange(start, end) {
  if (start === end) return format(parseISO(start), 'MMM d, yyyy');
  return `${format(parseISO(start), 'MMM d')} - ${format(parseISO(end), 'MMM d, yyyy')}`;
}

export default function TimeOffRequests() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const isApprover = HIGH_ROLES.includes(currentUser?.role);

  const [declineId, setDeclineId] = useState(null);
  const [declineReason, setDeclineReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [showSelfSet, setShowSelfSet] = useState(false);
  const [selfForm, setSelfForm] = useState({ start_date: '', end_date: '', reason: '' });

  const { data: requests = [] } = useQuery({
    queryKey: ['time-off-requests'],
    queryFn: () => base44.entities.TimeOffRequest.list('-created_date'),
  });

  // Approvers see all pending first, then others. Regular users see only their own.
  const visible = isApprover
    ? [...requests.filter(r => r.status === 'pending'), ...requests.filter(r => r.status !== 'pending')]
    : requests.filter(r => r.user_id === currentUser?.id);

  const reviewerName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email;

  const setSelfTimeOff = async () => {
    if (!selfForm.start_date) return;
    setSaving(true);
    const end = selfForm.end_date || selfForm.start_date;
    await base44.entities.TimeOffRequest.create({
      user_id: currentUser.id,
      user_name: reviewerName,
      user_role: currentUser.role,
      start_date: selfForm.start_date,
      end_date: end,
      reason: selfForm.reason || '',
      status: 'approved',
      reviewed_by: reviewerName,
    });
    setSelfForm({ start_date: '', end_date: '', reason: '' });
    setShowSelfSet(false);
    queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
    setSaving(false);
  };

  const approve = async (req) => {
    setSaving(true);
    await base44.entities.TimeOffRequest.update(req.id, {
      status: 'approved',
      reviewed_by: reviewerName,
    });
    queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
    setSaving(false);
  };

  const decline = async () => {
    if (!declineReason.trim()) return;
    setSaving(true);
    await base44.entities.TimeOffRequest.update(declineId, {
      status: 'declined',
      reviewed_by: reviewerName,
      decline_reason: declineReason.trim(),
    });
    setDeclineId(null);
    setDeclineReason('');
    queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
    setSaving(false);
  };

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Time Off Requests</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isApprover ? 'Review and manage all time off requests.' : 'Your submitted time off requests.'}
          </p>
        </div>
        {isApprover && (
          <Button size="sm" onClick={() => setShowSelfSet(v => !v)} variant="outline">
            <Plus className="w-4 h-4 mr-1" /> Set My Time Off
          </Button>
        )}
      </div>

      {/* Self-set time off form for high roles */}
      {isApprover && showSelfSet && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">Set Your Time Off</p>
          <p className="text-xs text-muted-foreground">This will be automatically approved and reflected on the crew schedule.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start Date *</Label>
              <Input type="date" value={selfForm.start_date} onChange={e => setSelfForm(f => ({ ...f, start_date: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs">End Date</Label>
              <Input type="date" value={selfForm.end_date} min={selfForm.start_date} onChange={e => setSelfForm(f => ({ ...f, end_date: e.target.value }))} className="mt-1" />
            </div>
          </div>
          <div>
            <Label className="text-xs">Reason (optional)</Label>
            <Textarea rows={2} value={selfForm.reason} onChange={e => setSelfForm(f => ({ ...f, reason: e.target.value }))} className="mt-1 text-sm" placeholder="Optional note..." />
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={setSelfTimeOff} disabled={!selfForm.start_date || saving} className="bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Saving...' : 'Confirm Time Off'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowSelfSet(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {visible.length === 0 && (
        <div className="text-center py-16">
          <CalendarOff className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No time off requests yet.</p>
        </div>
      )}

      <div className="space-y-3">
        {visible.map(req => (
          <div key={req.id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                {isApprover && (
                  <p className="text-sm font-semibold text-foreground">{req.user_name}</p>
                )}
                <p className="text-sm text-foreground font-medium">{formatRange(req.start_date, req.end_date)}</p>
                {req.reason && <p className="text-xs text-muted-foreground mt-0.5">{req.reason}</p>}
              </div>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full whitespace-nowrap ${statusConfig[req.status]?.color}`}>
                {statusConfig[req.status]?.label}
              </span>
            </div>

            {req.status === 'declined' && req.decline_reason && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                <strong>Decline reason:</strong> {req.decline_reason}
              </p>
            )}
            {req.reviewed_by && req.status !== 'pending' && (
              <p className="text-xs text-muted-foreground">Reviewed by {req.reviewed_by}</p>
            )}

            {isApprover && req.status === 'pending' && (
              declineId === req.id ? (
                <div className="space-y-2">
                  <Textarea
                    placeholder="Reason for declining..."
                    value={declineReason}
                    onChange={e => setDeclineReason(e.target.value)}
                    rows={2}
                    className="text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" onClick={decline} disabled={!declineReason.trim() || saving}>
                      Confirm Decline
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setDeclineId(null); setDeclineReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => approve(req)} disabled={saving}>
                    <Check className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => setDeclineId(req.id)}>
                    <X className="w-3.5 h-3.5 mr-1" /> Decline
                  </Button>
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}