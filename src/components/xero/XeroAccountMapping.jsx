import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

// Xero invoice lines post to a revenue Account. Map each estimate category to a Xero account so
// Schedule-of-Values / itemized lines land on the right account instead of the fallback.
const CATEGORIES = [
  { key: 'materials', label: 'Materials' },
  { key: 'labor', label: 'Labor' },
  { key: 'subcontractor', label: 'Subcontractor' },
  { key: 'other', label: 'Other / GC Fee' },
];

export default function XeroAccountMapping({ settings, onSaved }) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [map, setMap] = useState({});

  useEffect(() => { setMap(settings?.category_item_map || {}); }, [settings?.category_item_map]);

  const fetchAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('xeroSyncV2', { action: 'list_accounts' });
      if (res.data?.error) throw new Error(res.data.error);
      setAccounts(res.data?.accounts || []);
    } catch (e) {
      toast({ title: 'Failed to fetch Xero accounts', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleSelect = async (catKey, account) => {
    const next = { ...map };
    if (account) next[catKey] = { accountCode: account.Code, name: account.Name };
    else delete next[catKey];
    setMap(next);
    await base44.functions.invoke('xeroAuth', { action: 'update_settings', category_item_map: next });
    onSaved?.(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold font-butler">Account Mapping</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Map each category to a Xero revenue account. Invoice lines post to these accounts; unmapped lines use your first revenue account.
        </p>
      </div>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Xero Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CATEGORIES.map(cat => (
              <tr key={cat.key}>
                <td className="px-4 py-2.5 font-medium">{cat.label}</td>
                <td className="px-4 py-2.5">
                  <Select
                    value={map[cat.key]?.accountCode || '__none__'}
                    onValueChange={(val) => handleSelect(cat.key, val === '__none__' ? null : accounts.find(a => a.Code === val))}
                    disabled={loading || !accounts.length}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[280px]">
                      <SelectValue placeholder={loading ? 'Loading…' : 'Select account…'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (use fallback)</SelectItem>
                      {accounts.map(a => (
                        <SelectItem key={a.Code} value={a.Code}>{a.Code} · {a.Name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {map[cat.key]?.name && <p className="text-[11px] text-muted-foreground mt-0.5">{map[cat.key].name}</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}
