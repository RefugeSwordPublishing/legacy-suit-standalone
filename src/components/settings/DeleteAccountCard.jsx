import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, UserX } from 'lucide-react';

// Google Play requires an in-app way to request account deletion, alongside the public page at
// guildwright.app/delete-account. This records a request rather than deleting on the spot: an
// owner's account holds a tenant other people still work in, and a crew member's timecards are
// business records attached to finished jobs. A human works the request.
export default function DeleteAccountCard() {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState(null);
  const isOwner = currentUser?.role === 'owner';

  useEffect(() => {
    let cancelled = false;
    base44.entities.AccountDeletionRequest.filter({ status: 'open' })
      .then((rows) => { if (!cancelled) setExisting(rows?.[0] || null); })
      .catch(() => { /* a missing request is not an error worth surfacing */ });
    return () => { cancelled = true; };
  }, []);

  const submit = async () => {
    setSaving(true);
    try {
      const row = await base44.entities.AccountDeletionRequest.create({
        email: currentUser?.email || '',
        full_name: currentUser?.full_name || '',
        role: currentUser?.role || '',
        is_owner: isOwner,
        reason: reason.trim() || null,
      });
      setExisting(row);
      setOpen(false);
      setReason('');
      toast({
        title: 'Deletion request received',
        description: 'We will email you at your account address to confirm the next steps.',
      });
    } catch (e) {
      toast({ title: 'Could not send the request', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const withdraw = async () => {
    if (!window.confirm('Withdraw your account deletion request?')) return;
    setSaving(true);
    try {
      await base44.entities.AccountDeletionRequest.update(existing.id, { status: 'cancelled' });
      setExisting(null);
      toast({ title: 'Request withdrawn' });
    } catch (e) {
      toast({ title: 'Could not withdraw the request', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <div className="flex flex-col gap-3 p-4 rounded-lg border border-border bg-card">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-lg bg-destructive/10 p-2 text-destructive shrink-0"><UserX className="w-5 h-5" /></div>
        <div>
          <p className="text-sm font-semibold text-foreground">Delete my account</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {isOwner
              ? 'You own this company, so deleting your account also ends the account for everyone working in it. Send a request and we will confirm with you before anything is removed.'
              : 'Request removal of your account and personal details. Your timecards and the work attached to your company’s jobs stay with the company as business records.'}
          </p>
        </div>
      </div>

      {existing ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Request received {new Date(existing.created_at).toLocaleDateString()}. We will email you at your account address.
          </p>
          <button onClick={withdraw} disabled={saving}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Withdraw request
          </button>
        </div>
      ) : open ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Anything you want us to know (optional)"
            className="w-full rounded-lg border border-border bg-background p-2 text-sm"
          />
          <div className="flex gap-2 sm:justify-end">
            <button onClick={() => { setOpen(false); setReason(''); }} disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-border hover:bg-muted disabled:opacity-60">
              Cancel
            </button>
            <button onClick={submit} disabled={saving}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Send deletion request
            </button>
          </div>
        </div>
      ) : (
        <div className="sm:text-right">
          <button onClick={() => setOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-destructive/40 text-destructive hover:bg-destructive/10">
            Request account deletion
          </button>
        </div>
      )}
    </div>
  );
}
