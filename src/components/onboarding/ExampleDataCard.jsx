import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import { Sparkles, Loader2, Trash2 } from 'lucide-react';
import { seedSampleData, removeSampleData, countSampleData } from '@/lib/sampleData';

const MGMT = ['owner', 'admin', 'coo'];

// Load or remove a labeled set of example records (client, project, estimate) to learn the flow.
// Lives in Settings so removal is always reachable, even after the onboarding checklist is gone.
export default function ExampleDataCard() {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isMgmt = MGMT.includes(currentUser?.role);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try { setCount(await countSampleData()); } catch { setCount(null); }
  };
  useEffect(() => { if (isMgmt) refresh(); }, [isMgmt]);

  if (!isMgmt) return null;

  const invalidate = () => ['projects', 'estimates', 'clients'].forEach(k => queryClient.invalidateQueries({ queryKey: [k] }));

  const load = async () => {
    setBusy(true);
    try {
      await seedSampleData();
      toast({ title: 'Example data loaded', description: 'A sample client, project, and estimate are ready to explore.' });
      invalidate(); refresh();
    } catch (e) {
      toast({ title: 'Could not load example data', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const { removed } = await removeSampleData();
      toast({ title: 'Example data removed', description: `${removed} sample ${removed === 1 ? 'record' : 'records'} deleted.` });
      invalidate(); refresh();
    } catch (e) {
      toast({ title: 'Could not remove example data', description: e.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const hasSample = (count?.total || 0) > 0;

  return (
    <div>
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Example data</h2>
      <div className="flex items-start gap-3 p-4 rounded-lg border border-border bg-card">
        <div className="mt-0.5 rounded-lg bg-accent/15 p-2 text-accent shrink-0"><Sparkles className="w-5 h-5" /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Explore with example data</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasSample
              ? 'A sample client, project, and estimate are loaded. Open Estimates to see the flow, then remove them anytime.'
              : 'Load a sample client, project, and estimate to learn the estimate-to-invoice flow without touching your real jobs.'}
          </p>
        </div>
        {hasSample ? (
          <button onClick={remove} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-border text-red-600 hover:bg-red-50 disabled:opacity-60 shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Remove
          </button>
        ) : (
          <button onClick={load} disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-60 shrink-0">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />} Load example data
          </button>
        )}
      </div>
    </div>
  );
}
