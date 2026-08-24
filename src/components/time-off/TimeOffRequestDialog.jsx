import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { CalendarOff } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function TimeOffRequestDialog({ open, onOpenChange }) {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [range, setRange] = useState({ from: undefined, to: undefined });
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async () => {
    if (!range.from) return;
    setSaving(true);
    try {
      const startDate = format(range.from, 'yyyy-MM-dd');
      const endDate = format(range.to || range.from, 'yyyy-MM-dd');
      const userName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email;
      await base44.entities.TimeOffRequest.create({
        user_id: currentUser.id,
        user_name: userName,
        user_role: currentUser.role,
        start_date: startDate,
        end_date: endDate,
        reason: reason.trim() || undefined,
        status: 'pending',
      });
      queryClient.invalidateQueries({ queryKey: ['time-off-requests'] });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setRange({ from: undefined, to: undefined });
        setReason('');
        onOpenChange(false);
      }, 1500);
    } catch (e) {
      toast({ title: 'Could not submit request', description: e?.message ? String(e.message).slice(0, 160) : 'Please try again.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const displayRange = range.from
    ? range.to && range.to !== range.from
      ? `${format(range.from, 'MMM d')} - ${format(range.to, 'MMM d, yyyy')}`
      : format(range.from, 'MMM d, yyyy')
    : 'Select dates below';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarOff className="w-4 h-4" /> Request Time Off
          </DialogTitle>
        </DialogHeader>

        {submitted ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <CalendarOff className="w-6 h-6 text-green-600" />
            </div>
            <p className="font-semibold text-foreground">Request Submitted!</p>
            <p className="text-sm text-muted-foreground mt-1">Pending approval.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label className="mb-2 block">Selected: <span className="text-accent font-semibold">{displayRange}</span></Label>
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                disabled={{ before: new Date() }}
                className="rounded-lg border border-border mx-auto"
              />
            </div>
            <div>
              <Label>Reason (optional)</Label>
              <Textarea
                placeholder="e.g. Vacation, personal day..."
                value={reason}
                onChange={e => setReason(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
            <Button
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              disabled={!range.from || saving}
              onClick={handleSubmit}
            >
              {saving ? 'Submitting...' : 'Submit Request'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}