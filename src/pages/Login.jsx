import { useState } from 'react';
import { supabase } from '@/api/base44Client';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    // Reload at root so the session is present when the app and user context mount.
    window.location.assign('/');
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ backgroundColor: '#262525' }}>
      <div className="w-full max-w-sm rounded-2xl p-8 shadow-xl" style={{ backgroundColor: '#F5F2EA' }}>
        <div className="text-center mb-6">
          <img src="/guildwright-iconHD.png" alt="GuildWright" width={52} height={52} className="mx-auto mb-4 rounded-lg" />
          <h1 className="text-2xl font-bold" style={{ color: '#262525' }}>GuildWright</h1>
          <p className="text-sm mt-1" style={{ color: '#6B4B32' }}>One System. Every Job.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#262525' }}>Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: '#D8D2C4', backgroundColor: '#fff', color: '#262525' }}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: '#262525' }}>Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2"
              style={{ borderColor: '#D8D2C4', backgroundColor: '#fff', color: '#262525' }}
            />
          </div>

          {error && <p className="text-sm" style={{ color: '#b91c1c' }}>{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold transition-opacity disabled:opacity-60"
            style={{ backgroundColor: '#B58A45', color: '#262525' }}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>

          <a
            href="/reset-password"
            className="block text-center text-sm pt-1"
            style={{ color: '#6B4B32' }}
          >
            First time signing in, or forgot your password?
          </a>
        </form>
      </div>
    </div>
  );
}
