import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LifeBuoy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

// Where support submissions are emailed. Update when a guildwright.app support inbox exists.
const SUPPORT_EMAIL = 'support@refugeandsword.com';

// Controlled "Report an issue" dialog. Opened from the Settings menu (owner/admin only), not a
// floating button, so it never covers the mobile nav.
export default function ReportIssueDialog({ open, onOpenChange }) {
  const { currentUser } = useCurrentUser();
  const location = useLocation();
  const { toast } = useToast();
  const [category, setCategory] = useState('bug');
  const [page, setPage] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPage(location.pathname + location.search);
      setCategory('bug');
      setDescription('');
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!description.trim()) return;
    setSaving(true);
    const userName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.full_name || currentUser?.email;
    try {
      await base44.entities.SupportTicket.create({
        user_id: currentUser?.id,
        user_email: currentUser?.email,
        user_name: userName,
        page,
        category,
        description: description.trim(),
        status: 'open',
      });
      try {
        await base44.functions.invoke('sendEmail', {
          to: SUPPORT_EMAIL,
          subject: `GuildWright ${category}: ${description.trim().slice(0, 60)}`,
          from_name: 'GuildWright Support',
          reply_to: currentUser?.email,
          html: `<p><strong>${category.toUpperCase()}</strong> reported by ${userName} (${currentUser?.email})</p>
                 <p><strong>Page:</strong> ${page || '-'}</p>
                 <p><strong>Details:</strong><br/>${description.trim().replace(/\n/g, '<br/>')}</p>`,
        });
      } catch (_e) { /* email is best-effort; the ticket is already saved */ }
      toast({ title: 'Sent to support', description: 'Thanks. Our team will take a look.' });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Could not send', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LifeBuoy className="w-4 h-4" /> Report an issue</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Type</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">Something is broken</SelectItem>
                <SelectItem value="question">Question / need help</SelectItem>
                <SelectItem value="suggestion">Suggestion</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Page</Label>
            <Input value={page} onChange={e => setPage(e.target.value)} />
            <p className="text-xs text-muted-foreground mt-0.5">The page you were on (filled in for you).</p>
          </div>
          <div>
            <Label>What happened?</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What were you trying to do, and what went wrong? Steps to reproduce help a lot."
              rows={4}
            />
          </div>
          <Button onClick={submit} disabled={saving || !description.trim()} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {saving ? 'Sending...' : 'Send to support'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
