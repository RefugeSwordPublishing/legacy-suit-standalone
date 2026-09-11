import { useEffect, useState } from 'react';
import { supabase } from '@/api/base44Client';

// Handles two things:
//  1. The link a user clicks from the "set / reset your password" email. Supabase parses the
//     recovery token from the URL and gives us a temporary session; we let them choose a password.
//  2. A direct visit with no valid session -> offer to send a fresh reset link.
export default function ResetPassword() {
  const [ready, setReady] = useState(false);   // recovery session present -> show password form
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let done = false;
    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) { done = true; setReady(true); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!done) { setReady(!!data.session); setChecking(false); }
    });
    return () => sub.data.subscription.unsubscribe();
  }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) { setError(error.message); setSaving(false); return; }
    // Password set + already signed in via the recovery session -> go straight into the app.
    window.location.assign('/');
  };

  const handleRequestLink = async (e) => {
    e.preventDefault();
    setError(''); setInfo('');
    if (!email) { setError('Enter your email.'); return; }
    setSaving(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSaving(false);
    if (error) { setError(error.message); return; }
    setInfo('Check your email for a link to set your password.');
  };

  const inputStyle = { borderColor: '#D8D2C4', backgroundColor: '#fff', color: '#262525' };
  const inputCls = 'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2';

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#262525' }}>
      <div className="w-full max-w-sm rounded-2xl p-8 shadow-xl" style={{ backgroundColor: '#F5F2EA' }}>
        <div className="text-center mb-6">
          <img src="/guildwright-iconHD.png" alt="GuildWright" width={52} height={52} className="mx-auto mb-4 rounded-lg" />
          <h1 className="text-2xl font-bold" style={{ color: '#262525' }}>GuildWright</h1>
          <p className="text-sm mt-1" style={{ color: '#6B4B32' }}>
            {ready ? 'Choose your password' : 'Set your password'}
          </p>
        </div>

        {checking ? (
          <p className="text-sm text-center" style={{ color: '#6B4B32' }}>Checking your link...</p>
        ) : ready ? (
          <form onSubmit={handleSetPassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#262525' }}>New password</label>
              <input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className={inputCls} style={inputStyle} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#262525' }}>Confirm password</label>
              <input type="password" autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className={inputCls} style={inputStyle} />
            </div>
            {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: '#B58A45', color: '#262525' }}>
              {saving ? 'Saving...' : 'Save password & sign in'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequestLink} className="space-y-4">
            <p className="text-sm" style={{ color: '#6B4B32' }}>
              Enter your email and we'll send you a link to set your password.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: '#262525' }}>Email</label>
              <input type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required className={inputCls} style={inputStyle} />
            </div>
            {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}
            {info && <p className="text-sm" style={{ color: '#2d5a27' }}>{info}</p>}
            <button type="submit" disabled={saving} className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60" style={{ backgroundColor: '#B58A45', color: '#262525' }}>
              {saving ? 'Sending...' : 'Send reset link'}
            </button>
            <a href="/" className="block text-center text-sm" style={{ color: '#6B4B32' }}>Back to sign in</a>
          </form>
        )}
      </div>
    </div>
  );
}
