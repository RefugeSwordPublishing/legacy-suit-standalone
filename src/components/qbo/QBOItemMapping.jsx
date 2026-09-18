import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Zap } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function similarity(a, b) {
  a = (a || '').toLowerCase().trim();
  b = (b || '').toLowerCase().trim();
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.8;
  return 0;
}

export default function QBOItemMapping() {
  const { toast } = useToast();
  const [costCodes, setCostCodes] = useState([]);
  const [qboItems, setQboItems] = useState([]);
  const [qboAccounts, setQboAccounts] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [autoMatched, setAutoMatched] = useState(new Set());

  const loadCostCodes = async () => {
    const codes = await base44.entities.CostCode.list('name');
    setCostCodes(codes);
  };

  const fetchQBOItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const [itemsRes, accountsRes] = await Promise.all([
        base44.functions.invoke('quickbooksSyncV2', { action: 'list_items' }),
        base44.functions.invoke('quickbooksSyncV2', { action: 'list_accounts' }),
      ]);
      setQboItems(itemsRes.data?.items || []);
      setQboAccounts(accountsRes.data?.accounts || []);
      toast({ title: 'QBO items refreshed' });
    } catch (e) {
      toast({ title: 'Failed to fetch QBO items', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => {
    loadCostCodes();
    fetchQBOItems();
  }, []);

  const handleSelectItem = async (costCode, qboItem) => {
    const update = qboItem
      ? { quickbooks_item_id: qboItem.Id, quickbooks_item_name: qboItem.Name }
      : { quickbooks_item_id: '', quickbooks_item_name: '' };
    await base44.entities.CostCode.update(costCode.id, update);
    setCostCodes(prev => prev.map(c => c.id === costCode.id ? { ...c, ...update } : c));
  };

  const handleSelectAccount = async (costCode, account) => {
    const update = account
      ? { quickbooks_income_account_id: account.Id, quickbooks_income_account_name: account.Name }
      : { quickbooks_income_account_id: '', quickbooks_income_account_name: '' };
    await base44.entities.CostCode.update(costCode.id, update);
    setCostCodes(prev => prev.map(c => c.id === costCode.id ? { ...c, ...update } : c));
  };

  const handleAutoMatch = async () => {
    if (!qboItems.length) return;
    let matched = 0;
    const newMatched = new Set();
    const updates = [];

    for (const cc of costCodes) {
      if (cc.quickbooks_item_id) continue; // already mapped
      let bestItem = null;
      let bestScore = 0;
      for (const item of qboItems) {
        const score = Math.max(
          similarity(cc.name, item.Name),
          similarity(cc.code, item.Name)
        );
        if (score > bestScore) { bestScore = score; bestItem = item; }
      }
      if (bestScore === 1 && bestItem) {
        updates.push({ cc, item: bestItem });
        matched++;
      } else if (bestScore >= 0.8 && bestItem) {
        newMatched.add(cc.id); // highlight for review
      }
    }

    for (const { cc, item } of updates) {
      await base44.entities.CostCode.update(cc.id, {
        quickbooks_item_id: item.Id,
        quickbooks_item_name: item.Name,
      });
    }

    await loadCostCodes();
    setAutoMatched(newMatched);
    toast({ title: `Auto-match complete`, description: `${matched} exact matches applied. ${newMatched.size} partial matches highlighted.` });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold font-butler">QuickBooks Item Mapping</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Link each cost code to a QBO Product/Service for accurate invoice line items.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={fetchQBOItems} disabled={loadingItems} className="gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loadingItems ? 'animate-spin' : ''}`} />
            Sync Items
          </Button>
          <Button size="sm" variant="outline" onClick={handleAutoMatch} disabled={!qboItems.length} className="gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            Auto-Match
          </Button>
        </div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Cost Code</th>
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground hidden sm:table-cell">Category</th>
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">QBO Item</th>
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Income Account</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {costCodes.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No cost codes found.</td>
              </tr>
            )}
            {costCodes.map(cc => (
              <tr
                key={cc.id}
                className={autoMatched.has(cc.id) ? 'bg-amber-50 border-l-2 border-l-amber-400' : ''}
              >
                <td className="px-4 py-2.5">
                  <span className="font-medium">{cc.name}</span>
                  <span className="text-xs text-muted-foreground ml-1.5">({cc.code})</span>
                  {autoMatched.has(cc.id) && (
                    <Badge variant="secondary" className="ml-2 text-[10px] py-0 px-1.5 bg-amber-100 text-amber-700 border-amber-300">
                      Review
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground capitalize hidden sm:table-cell">{cc.category || ''}</td>
                <td className="px-4 py-2.5">
                  <Select
                    value={cc.quickbooks_item_id || '__none__'}
                    onValueChange={(val) => {
                      const item = val === '__none__' ? null : qboItems.find(i => i.Id === val);
                      handleSelectItem(cc, item);
                      setAutoMatched(prev => { const n = new Set(prev); n.delete(cc.id); return n; });
                    }}
                    disabled={loadingItems || !qboItems.length}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[240px]">
                      <SelectValue placeholder={loadingItems ? 'Loading…' : 'Select QBO item…'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {qboItems.map(item => (
                        <SelectItem key={item.Id} value={item.Id}>{item.Name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cc.quickbooks_item_name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{cc.quickbooks_item_name}</p>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <Select
                    value={cc.quickbooks_income_account_id || '__none__'}
                    onValueChange={(val) => {
                      const account = val === '__none__' ? null : qboAccounts.find(a => a.Id === val);
                      handleSelectAccount(cc, account);
                    }}
                    disabled={loadingItems || !qboAccounts.length}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[240px]">
                      <SelectValue placeholder={loadingItems ? 'Loading…' : 'Select account…'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {qboAccounts.map(account => (
                        <SelectItem key={account.Id} value={account.Id}>{account.Name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {cc.quickbooks_income_account_name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{cc.quickbooks_income_account_name}</p>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  );
}