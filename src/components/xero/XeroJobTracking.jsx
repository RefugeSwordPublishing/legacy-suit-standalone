import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { CheckCircle2, Loader2, Tags } from 'lucide-react';

// Job tracking: Xero has no sub-customers, so revenue is split by a Tracking Category whose options
// are project names. Pick an existing active category or create one (Xero allows at most 2). Once set,
// each pushed invoice tags its lines with the project, so Xero reports break down by job. The push
// side auto-creates the option per project; this only chooses the category.
export default function XeroJobTracking({ settings, onSaved }) {
  const { toast } = useToast();
  const [categories, setCategories] = useState([]);
  const [canCreate, setCanCreate] = useState(true);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pick, setPick] = useState('');

  const activeId = settings?.tracking_category_id || null;
  const activeName = settings?.tracking_category_name || null;

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('xeroSyncV2', { action: 'list_tracking_categories' });
      if (res.data?.error) throw new Error(res.data.error);
      setCategories(res.data?.categories || []);
      setCanCreate(res.data?.canCreate ?? true);
    } catch (e) {
      toast({ title: 'Failed to load Xero tracking categories', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (!activeId) fetchCategories(); }, [activeId, fetchCategories]);

  const save = async (id, name) => {
    setBusy(true);
    try {
      await base44.functions.invoke('xeroAuth', { action: 'update_settings', tracking_category_id: id, tracking_category_name: name });
      onSaved?.({ tracking_category_id: id, tracking_category_name: name });
      toast({ title: id ? 'Job tracking enabled' : 'Job tracking disabled' });
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const useExisting = () => {
    const cat = categories.find(c => c.id === pick);
    if (cat) save(cat.id, cat.name);
  };

  const createCategory = async () => {
    setBusy(true);
    try {
      const res = await base44.functions.invoke('xeroSyncV2', { action: 'create_tracking_category', name: 'Project' });
      if (res.data?.error) throw new Error(res.data.error);
      await save(res.data.id, res.data.name);
    } catch (e) {
      toast({ title: 'Could not create category', description: e.message, variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold font-butler flex items-center gap-2"><Tags className="w-4 h-4" /> Job Tracking</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Tag each invoice with its project on a Xero tracking category, so revenue reports break down by job. This is the Xero equivalent of a sub-customer per project.
        </p>
      </div>

      {activeId ? (
        <div className="border border-border rounded-xl p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
            <div>
              <p className="text-sm font-medium">Tracking by “{activeName || 'Project'}”</p>
              <p className="text-xs text-muted-foreground">Each pushed invoice adds its project as an option on this category.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => save(null, null)} disabled={busy} className="shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Disable'}
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl p-4 space-y-3">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading categories…</div>
          ) : (
            <>
              {categories.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-end gap-2">
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground mb-1">Use an existing tracking category</p>
                    <Select value={pick} onValueChange={setPick} disabled={busy}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select a category…" /></SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name} ({c.optionCount} options)</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button size="sm" onClick={useExisting} disabled={busy || !pick}>Use this</Button>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  {canCreate ? 'Or let GuildWright create a “Project” category for you.' : 'This org already has 2 tracking categories (Xero’s limit). Pick one above.'}
                </p>
                <Button size="sm" variant="outline" onClick={createCategory} disabled={busy || !canCreate} className="shrink-0">
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create “Project”'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
