import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, Link2Off, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@/lib/UserContext';
import SettingsBack from '@/components/shared/SettingsBack';
import XeroAccountMapping from '@/components/xero/XeroAccountMapping';
import XeroJobTracking from '@/components/xero/XeroJobTracking';

export default function XeroSettings() {
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const canAccess = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('xeroAuth', { action: 'get_settings' });
      setSettings(res.data?.settings || null);
    } catch { setSettings(null); } finally { setLoading(false); }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    if (code) {
      window.history.replaceState({}, '', '/xero-settings');
      setConnecting(true);
      base44.functions.invoke('xeroAuth', { action: 'exchange_code', code }).then(res => {
        if (res.data?.success) toast({ title: 'Xero Connected!', description: `Organization: ${res.data.orgs?.[0]?.tenantName || 'linked'}.` });
        else toast({ title: 'Connection failed', description: res.data?.error || 'Please try again.', variant: 'destructive' });
      }).catch(e => toast({ title: 'Connection failed', description: e.message, variant: 'destructive' }))
        .finally(() => { setConnecting(false); loadSettings(); });
    } else loadSettings();
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    const res = await base44.functions.invoke('xeroAuth', { action: 'get_auth_url' });
    if (!res.data?.url) { toast({ title: 'Could not get auth URL', variant: 'destructive' }); setConnecting(false); return; }
    window.location.href = res.data.url;
  };

  const handleDisconnect = async () => {
    await base44.functions.invoke('xeroAuth', { action: 'disconnect' });
    toast({ title: 'Disconnected from Xero' });
    loadSettings();
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await base44.functions.invoke('xeroAuth', { action: 'clear_cache' });
      toast({ title: 'Xero cache cleared', description: `${res.data?.clients_cleared || 0} contacts, ${res.data?.cost_codes_cleared || 0} accounts reset.` });
    } catch (e) { toast({ title: 'Failed to clear cache', description: e.message, variant: 'destructive' }); }
    finally { setClearing(false); }
  };

  const handleToggle = async (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    await base44.functions.invoke('xeroAuth', { action: 'update_settings', [field]: value });
  };

  if (!canAccess) return <div className="p-8 text-center text-muted-foreground">You don&apos;t have permission to access this page.</div>;
  if (loading) return <div className="p-8 flex items-center justify-center"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>;

  const isConnected = settings?.is_connected;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <SettingsBack />
      <div>
        <h1 className="text-2xl font-bold font-butler">Xero Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your Xero organization to push invoices from GuildWright.</p>
      </div>

      <div className="border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isConnected ? <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" /> : <XCircle className="w-6 h-6 text-muted-foreground shrink-0" />}
            <div>
              <p className="font-semibold text-sm">{isConnected ? 'Connected to Xero' : 'Not Connected'}</p>
              {isConnected && settings?.org_name && <p className="text-sm text-foreground font-medium mt-0.5">{settings.org_name}</p>}
              {isConnected && settings?.last_sync_at && <p className="text-xs text-muted-foreground mt-0.5">Last sync: {new Date(settings.last_sync_at).toLocaleString()}</p>}
            </div>
          </div>
          {!isConnected && (
            <Button size="sm" onClick={handleConnect} disabled={connecting} className="gap-2">
              <ExternalLink className="w-4 h-4" />{connecting ? 'Connecting...' : 'Connect Xero'}
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

      {isConnected && (
        <>
          <div className="space-y-4">
            <h2 className="text-base font-semibold">Invoice Settings</h2>
            <div className="border border-border rounded-xl divide-y divide-border">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm font-medium">Auto-send to client</p>
                  <p className="text-xs text-muted-foreground">When on, a pushed invoice is authorised and emailed to the client. Off keeps it as a draft to review in Xero.</p>
                </div>
                <Switch checked={settings?.auto_send ?? false} onCheckedChange={(v) => handleToggle('auto_send', v)} />
              </div>
              <div className="flex items-center justify-between p-4 gap-4">
                <div>
                  <p className="text-sm font-medium">Default tax type</p>
                  <p className="text-xs text-muted-foreground">Xero tax code applied to invoice lines. Use NONE for tax-exempt, or your Xero tax rate code (e.g. OUTPUT).</p>
                </div>
                <Input className="w-32 h-8 text-sm" value={settings?.default_tax_type || 'NONE'} onChange={(e) => setSettings(p => ({ ...p, default_tax_type: e.target.value }))} onBlur={(e) => handleToggle('default_tax_type', e.target.value.trim() || 'NONE')} />
              </div>
            </div>
          </div>

          <XeroAccountMapping settings={settings} onSaved={(m) => setSettings(prev => ({ ...prev, category_item_map: m }))} />

          <XeroJobTracking settings={settings} onSaved={(patch) => setSettings(prev => ({ ...prev, ...patch }))} />

          <div className="border border-border rounded-xl p-5 space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Clear Xero Cache</p>
                <p className="text-xs text-muted-foreground mt-0.5">Resets stored Xero contact and account ids. The next push does fresh lookups.</p>
              </div>
              <Button size="sm" variant="outline" onClick={handleClearCache} disabled={clearing} className="gap-2 shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50">
                <Trash2 className="w-3.5 h-3.5" />{clearing ? 'Clearing...' : 'Clear Cache'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
