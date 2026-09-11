import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

// Estimate categories that Schedule-of-Values invoices roll up to. These carry no cost code,
// so they need their own QBO item mapping (separate from the cost-code map above).
const CATEGORIES = [
  { key: 'materials', label: 'Materials' },
  { key: 'labor', label: 'Labor' },
  { key: 'subcontractor', label: 'Subcontractor' },
  { key: 'other', label: 'Other / GC Fee' },
];

export default function QBOCategoryMapping({ settings, onSaved }) {
  const { toast } = useToast();
  const [qboItems, setQboItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [map, setMap] = useState({});

  useEffect(() => {
    setMap(settings?.category_item_map || {});
  }, [settings?.category_item_map]);

  const fetchItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const res = await base44.functions.invoke('quickbooksSyncV2', { action: 'list_items' });
      setQboItems(res.data?.items || []);
    } catch (e) {
      toast({ title: 'Failed to fetch QBO items', description: e.message, variant: 'destructive' });
    } finally {
      setLoadingItems(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleSelect = async (catKey, item) => {
    const next = { ...map };
    if (item) next[catKey] = { id: item.Id, name: item.Name };
    else delete next[catKey];
    setMap(next);
    await base44.functions.invoke('quickbooksAuth', { action: 'update_settings', category_item_map: next });
    onSaved?.(next);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold font-butler">QuickBooks Category Mapping</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Schedule-of-Values invoices group lines by category. Map each category to a QBO Product/Service so those lines land on the right item instead of the generic fallback.
        </p>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Category</th>
              <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">QBO Item</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {CATEGORIES.map(cat => (
              <tr key={cat.key}>
                <td className="px-4 py-2.5 font-medium">{cat.label}</td>
                <td className="px-4 py-2.5">
                  <Select
                    value={map[cat.key]?.id || '__none__'}
                    onValueChange={(val) => handleSelect(cat.key, val === '__none__' ? null : qboItems.find(i => i.Id === val))}
                    disabled={loadingItems || !qboItems.length}
                  >
                    <SelectTrigger className="h-8 text-xs w-full max-w-[280px]">
                      <SelectValue placeholder={loadingItems ? 'Loading…' : 'Select QBO item…'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None (use fallback)</SelectItem>
                      {qboItems.map(item => (
                        <SelectItem key={item.Id} value={item.Id}>{item.Name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {map[cat.key]?.name && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{map[cat.key].name}</p>
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
