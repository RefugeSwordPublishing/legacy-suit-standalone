import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MailCheck } from 'lucide-react';

const TRIAL_DAYS = 14;

// Self-service signup. Supabase creates the account and sends the confirmation mail; the company
// itself is not built until that link is clicked and they sign in, so an abandoned signup leaves
// an unconfirmed account and nothing else.
export default function Signup() {
  const [form, setForm] = useState({ companyName: '', firstName: '', lastName: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.companyName.trim()) return setError('Enter your company name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return setError('Enter a valid email address.');
    if (form.password.length < 8) return setError('Use a password of at least 8 characters.');

    setBusy(true);
    const { data, error: sErr } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login?confirmed=1`,
        data: { full_name: [form.firstName, form.lastName].filter(Boolean).join(' ').trim() },
      },
    });
    if (sErr) {
      setBusy(false);
      // Do not reveal whether an address is already registered.
      return setError(/already|registered/i.test(sErr.message)
        ? 'That email cannot start a new account. Try signing in instead.'
        : sErr.message);
    }

    const userId = data?.user?.id;
    if (!userId) { setBusy(false); return setError('Could not start the signup. Try again.'); }

    const { data: res, error: fErr } = await supabase.functions.invoke('signup-tenant', {
      body: {
        action: 'start', userId,
        companyName: form.companyName.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
      },
    });
    setBusy(false);
    if (fErr || res?.error) return setError(res?.error || fErr?.message || 'Could not start the signup.');
    setSent(true);
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-background">
        <div className="w-full max-w-md text-center space-y-4">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-accent/15 flex items-center justify-center">
            <MailCheck className="w-7 h-7 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
          <p className="text-sm text-muted-foreground">
            We sent a confirmation link to <strong className="text-foreground">{form.email.trim()}</strong>.
            Click it and your {form.companyName.trim()} account is ready, with {TRIAL_DAYS} days of full
            access and no card.
          </p>
          <p className="text-xs text-muted-foreground">
            Nothing arrived? Check spam, then <Link to="/signup" className="text-accent underline">try again</Link>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <form onSubmit={submit} className="w-full max-w-md space-y-4">
        <div className="text-center mb-2">
          <h1 className="text-2xl font-bold text-foreground">Start your {TRIAL_DAYS}-day trial</h1>
          <p className="text-sm text-muted-foreground mt-1">Full access, your whole crew, no credit card.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Company name</Label>
          <Input value={form.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Timberline Renovations" autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>First name</Label>
            <Input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Last name</Label>
            <Input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Work email</Label>
          <Input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>Password</Label>
          <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="At least 8 characters" />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : null} Create my account
        </Button>

        <p className="text-xs text-center text-muted-foreground">
          Already have an account? <Link to="/login" className="text-accent underline">Sign in</Link>.
          Plans and billing are managed on the web after your trial.
        </p>
      </form>
    </div>
  );
}
