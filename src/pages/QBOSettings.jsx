import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { CheckCircle2, XCircle, RefreshCw, ExternalLink, Link2Off, Copy, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { useCurrentUser } from '@/lib/UserContext';
import QBOItemMapping from '@/components/qbo/QBOItemMapping';
import QBOCategoryMapping from '@/components/qbo/QBOCategoryMapping';

export default function QBOSettings() {
  const { toast } = useToast();
  const { currentUser } = useCurrentUser();
  const canAccess = currentUser?.role === 'owner' || currentUser?.role === 'admin';
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [redirectUri, setRedirectUri] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, uriRes] = await Promise.all([
        base44.functions.invoke('quickbooksAuth', { action: 'get_settings' }),
        base44.functions.invoke('quickbooksAuth', { action: 'get_redirect_uri' }),
      ]);
      setSettings(settingsRes.data?.settings || null);
      setRedirectUri(uriRes.data?.redirect_uri || '');
    } catch (e) {
      setSettings(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Handle OAuth callback, QBO redirects back to this page with ?code=...&realmId=...
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const realmId = params.get('realmId');

    if (code && realmId) {
      // Clear the URL params immediately
      window.history.replaceState({}, '', '/qbo-settings');
      setConnecting(true);
      base44.functions.invoke('quickbooksAuth', {
        action: 'exchange_code',
        code,
        realm_id: realmId,
      }).then(res => {
        if (res.data?.success) {
          toast({ title: 'QuickBooks Connected!', description: 'Your account is now linked.' });
        } else {
          toast({ title: 'Connection failed', description: res.data?.error || 'Please try again.', variant: 'destructive' });
        }
      }).catch(e => {
        toast({ title: 'Connection failed', description: e.message, variant: 'destructive' });
      }).finally(() => {
        setConnecting(false);
        loadSettings();
      });
    } else {
      loadSettings();
    }
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    const res = await base44.functions.invoke('quickbooksAuth', { action: 'get_auth_url' });
    const authUrl = res.data?.url;
    if (!authUrl) {
      toast({ title: 'Could not get auth URL', variant: 'destructive' });
      setConnecting(false);
      return;
    }
    // Full redirect, QBO sends user back to /qbo-settings with ?code=...&realmId=...
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    await base44.functions.invoke('quickbooksAuth', { action: 'disconnect' });
    toast({ title: 'Disconnected from QuickBooks' });
    loadSettings();
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      const res = await base44.functions.invoke('quickbooksAuth', { action: 'clear_cache' });
      toast({ title: 'QBO cache cleared', description: `${res.data?.cost_codes_cleared || 0} cost codes, ${res.data?.clients_cleared || 0} clients, ${res.data?.projects_cleared || 0} projects reset.` });
    } catch (e) {
      toast({ title: 'Failed to clear cache', description: e.message, variant: 'destructive' });
    } finally {
      setClearing(false);
    }
  };

  const handleToggle = async (field, value) => {
    setSettings(prev => ({ ...prev, [field]: value }));
    await base44.functions.invoke('quickbooksAuth', {
      action: 'update_settings',
      [field]: value,
    });
  };

  if (!canAccess) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>You don't have permission to access this page.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = settings?.is_connected;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-butler">QBO Integration</h1>
        <p className="text-muted-foreground text-sm mt-1">Connect your QuickBooks Online account to sync invoices, clients, and projects.</p>
      </div>

      {/* Connection Status */}
      <div className="border border-border rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {isConnected ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="w-6 h-6 text-muted-foreground shrink-0" />
            )}
            <div>
              <p className="font-semibold text-sm">{isConnected ? 'Connected to QuickBooks Online' : 'Not Connected'}</p>
              {isConnected && settings?.company_name && (
                <p className="text-sm text-foreground font-medium mt-0.5">{settings.company_name}</p>
              )}
              {isConnected && settings?.company_email && (
                <p className="text-xs text-muted-foreground">{settings.company_email}</p>
              )}
              {isConnected && settings?.realm_id && (
                <p className="text-xs text-muted-foreground">Company ID: {settings.realm_id}</p>
              )}
              {isConnected && settings?.last_sync_at && (
                <p className="text-xs text-muted-foreground mt-0.5">Last sync: {new Date(settings.last_sync_at).toLocaleString()}</p>
              )}
            </div>
          </div>
          {!isConnected && (
            <Button size="sm" onClick={handleConnect} disabled={connecting} className="gap-2">
              <ExternalLink className="w-4 h-4" />
              {connecting ? 'Connecting...' : 'Connect QuickBooks'}
            </Button>
          )}
        </div>

        {isConnected && (
          <div className="flex gap-2 pt-1 border-t border-border">
            <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting} className="gap-2">
              <ExternalLink className="w-4 h-4" />
              {connecting ? 'Redirecting...' : 'Switch Account'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDisconnect} className="gap-2 text-red-500 border-red-200">
              <Link2Off className="w-4 h-4" />
              Disconnect
            </Button>
          </div>
        )}
      </div>

      {/* Sync Settings */}
      <div className="space-y-4">
        <h2 className="text-base font-semibold">Sync Settings</h2>
        <div className="border border-border rounded-xl divide-y divide-border">
          {[
            { key: 'sync_invoices', label: 'Invoices', description: 'Two-way sync, push from app, receive paid status from QBO' },
            { key: 'sync_clients', label: 'Clients', description: 'One-way sync, app to QuickBooks' },
            { key: 'sync_projects', label: 'Projects', description: 'One-way sync, app to QuickBooks (as sub-customers)' },
            { key: 'auto_send', label: 'Auto-send to client', description: 'When on, pushing an invoice emails it to the client immediately. When off, it lands in QuickBooks as a draft for you to review and send.' },
          ].map(({ key, label, description }) => (
            <div key={key} className="flex items-center justify-between p-4">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                checked={settings?.[key] ?? false}
                onCheckedChange={(val) => handleToggle(key, val)}
                disabled={!isConnected}
              />
            </div>
          ))}
        </div>
      </div>

      {/* QBO Item Mapping */}
      {isConnected && (
        <QBOItemMapping />
      )}

      {/* Category Mapping (for Schedule-of-Values invoices) */}
      {isConnected && (
        <QBOCategoryMapping
          settings={settings}
          onSaved={(map) => setSettings(prev => ({ ...prev, category_item_map: map }))}
        />
      )}

      {/* Clear Cache */}
      <div className="border border-border rounded-xl p-5 space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">Clear QBO Cache</p>
            <p className="text-xs text-muted-foreground mt-0.5">Resets all stored QBO IDs on cost codes and clients. The next sync will do fresh lookups instead of reusing potentially stale IDs.</p>
          </div>
          <Button size="sm" variant="outline" onClick={handleClearCache} disabled={clearing} className="gap-2 shrink-0 text-amber-700 border-amber-300 hover:bg-amber-50">
            <Trash2 className="w-3.5 h-3.5" />
            {clearing ? 'Clearing...' : 'Clear Cache'}
          </Button>
        </div>
      </div>

    </div>
  );
}