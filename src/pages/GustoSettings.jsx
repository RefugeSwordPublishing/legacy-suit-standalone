import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, Link2Off, FlaskConical } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@/lib/UserContext';
import SettingsBack from '@/components/shared/SettingsBack';
import GustoEmployeeMapping from '@/components/gusto/GustoEmployeeMapping';

export default function GustoSettings() {
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const canAccess = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const [settings, setSettings] = useState(null);
  const [env, setEnv] = useState('demo');
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demo, setDemo] = useState({ access_token: '', refresh_token: '', company_uuid: '', company_name: '' });
  const [demoSaving, setDemoSaving] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('gustoAuth', { action: 'get_settings' });
      setSettings(res.data?.settings || null);
      setEnv(res.data?.env || 'demo');
    } catch { setSettings(null); } finally { setLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', '/gusto-settings');
      setConnecting(true);
      base44.functions.invoke('gustoAuth', { action: 'exchange_code', code }).then(res => {
        if (res.data?.success) toast({ title: 'Gusto Connected!', description: res.data.company_name ? `Company: ${res.data.company_name}.` : 'Linked.' });
        else toast({ title: 'Connection failed', description: res.data?.error || 'Please try again.', variant: 'destructive' });
      }).catch(e => toast({ title: 'Connection failed', description: e.message, variant: 'destructive' }))
        .finally(() => { setConnecting(false); loadSettings(); });
    } else loadSettings();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    const res = await base44.functions.invoke('gustoAuth', { action: 'get_auth_url' });
    if (!res.data?.url) { toast({ title: 'Could not get auth URL', variant: 'destructive' }); setConnecting(false); return; }
    window.location.href = res.data.url;
  };

  const handleDisconnect = async () => {
    await base44.functions.invoke('gustoAuth', { action: 'disconnect' });
    toast({ title: 'Disconnected from Gusto' });
    loadSettings();
  };

  const connectDemo = async () => {
    if (!demo.refresh_token.trim() || !demo.company_uuid.trim()) {
      toast({ title: 'Refresh token and Company UUID are required', variant: 'destructive' });
      return;
    }
    setDemoSaving(true);
    try {
      const res = await base44.functions.invoke('gustoAuth', {
        action: 'set_demo_tokens',
        access_token: demo.access_token.trim(),
        refresh_token: demo.refresh_token.trim(),
        company_uuid: demo.company_uuid.trim(),
        company_name: demo.company_name.trim(),
      });
      if (res.data?.success) {
        toast({ title: 'Demo company connected', description: res.data.company_name });
        setDemo({ access_token: '', refresh_token: '', company_uuid: '', company_name: '' });
        setDemoOpen(false);
        loadSettings();
      } else {
        toast({ title: 'Could not connect', description: res.data?.error || 'Check the tokens and try again.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Could not connect', description: e.message, variant: 'destructive' });
    } finally { setDemoSaving(false); }
  };

  if (!canAccess) return <div className="p-8 text-center text-muted-foreground">You don&apos;t have permission to access this page.</div>;
  if (loading) return <div className="p-8 flex items-center justify-center"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const isConnected = settings?.is_connected;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <SettingsBack />
      <div>
        <h1 className="text-2xl font-bold font-butler flex items-center gap-2">
          Gusto Payroll
          {env !== 'production' && <span className="text-[10px] uppercase tracking-wider font-highway px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-300">Demo</span>}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Connect Gusto to push approved hours straight onto a payroll, no CSV in between.</p>
      </div>

      <div className="border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isConnected ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /> : <XCircle className="w-6 h-6 text-muted-foreground shrink-0" />}
            <div>
              <p className="font-semibold text-sm">{isConnected ? 'Connected to Gusto' : 'Not Connected'}</p>
              {isConnected && settings?.gusto_company_name && <p className="text-sm text-foreground font-medium mt-0.5">{settings.gusto_company_name}</p>}
              {isConnected && settings?.last_sync_at && <p className="text-xs text-muted-foreground mt-0.5">Last push: {new Date(settings.last_sync_at).toLocaleString()}</p>}
            </div>
          </div>
          {!isConnected && (
            <Button size="sm" onClick={handleConnect} disabled={connecting} className="gap-2">
              <ExternalLink className="w-4 h-4" />{connecting ? 'Connecting...' : 'Connect Gusto'}
            </Button>
          )}
        </div>
        {isConnected && (
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting} className="gap-2">
              <ExternalLink className="w-4 h-4" />{connecting ? 'Redirecting...' : 'Reconnect'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2 text-red-500 border-red-200">
              <Link2Off className="w-4 h-4" />Disconnect
            </Button>
          </div>
        )}
      </div>

      {!isConnected && env !== 'production' && (
        <div className="border border-amber-300 bg-amber-50/50 rounded-xl p-5 space-y-3">
          <button onClick={() => setDemoOpen(o => !o)} className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <FlaskConical className="w-4 h-4" /> Connect a demo company (paste tokens)
          </button>
          <p className="text-xs text-muted-foreground">
            Gusto&apos;s Partner Managed demo companies have no interactive login. In the Gusto developer portal open a demo company, Reveal its Access token and Refresh token, and paste them here with the company UUID. This path is disabled in production.
          </p>
          {demoOpen && (
            <div className="space-y-3 pt-1">
              <div>
                <Label className="text-xs">Company UUID</Label>
                <Input value={demo.company_uuid} onChange={e => setDemo(d => ({ ...d, company_uuid: e.target.value }))} placeholder="fa1905b3-1676-4beb-9b7d-…" className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Company name</Label>
                <Input value={demo.company_name} onChange={e => setDemo(d => ({ ...d, company_name: e.target.value }))} placeholder="Jade Bridge Ltd." />
              </div>
              <div>
                <Label className="text-xs">Refresh token</Label>
                <Input value={demo.refresh_token} onChange={e => setDemo(d => ({ ...d, refresh_token: e.target.value }))} placeholder="Reveal + copy from the portal" className="font-mono text-xs" />
              </div>
              <div>
                <Label className="text-xs">Access token <span className="text-muted-foreground">(optional)</span></Label>
                <Input value={demo.access_token} onChange={e => setDemo(d => ({ ...d, access_token: e.target.value }))} placeholder="Optional; we refresh on first use" className="font-mono text-xs" />
              </div>
              <Button size="sm" onClick={connectDemo} disabled={demoSaving} className="gap-2">
                {demoSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FlaskConical className="w-4 h-4" />} Connect demo company
              </Button>
            </div>
          )}
        </div>
      )}

      {isConnected && <GustoEmployeeMapping />}

      <p className="text-xs text-muted-foreground leading-relaxed">
        Once employees are mapped, open the Timecard Report, pick a pay period, and choose Send to Gusto to push each worker&apos;s regular and overtime hours onto their unprocessed Gusto payroll. You still review and run the payroll in Gusto.
      </p>
    </div>
  );
}
