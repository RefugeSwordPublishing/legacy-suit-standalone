import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Wand2 } from 'lucide-react';

// Map each GuildWright worker to a Gusto employee so pushed hours land on the right person.
// Stored on user_profiles.gusto_employee_uuid. Auto-map matches on full name (case-insensitive).
export default function GustoEmployeeMapping() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [automapping, setAutomapping] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, profs] = await Promise.all([
        base44.functions.invoke('gustoSyncV2', { action: 'list_employees' }),
        base44.entities.UserProfile.list(),
      ]);
      if (empRes.data?.error) throw new Error(empRes.data.error);
      setEmployees(empRes.data?.employees || []);
      setProfiles((profs || []).filter(p => p.is_active !== false));
    } catch (e) {
      toast({ title: 'Failed to load Gusto employees', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setMapping = async (profile, uuid) => {
    setSavingId(profile.id);
    try {
      await base44.entities.UserProfile.update(profile.id, { gusto_employee_uuid: uuid || null });
      setProfiles(prev => prev.map(p => p.id === profile.id ? { ...p, gusto_employee_uuid: uuid || null } : p));
    } catch (e) {
      toast({ title: 'Could not save mapping', description: e.message, variant: 'destructive' });
    } finally { setSavingId(null); }
  };

  const autoMap = async () => {
    setAutomapping(true);
    let matched = 0;
    const norm = (s) => (s || '').trim().toLowerCase();
    const byName = new Map(employees.map(e => [norm(e.name), e.uuid]));
    for (const p of profiles) {
      if (p.gusto_employee_uuid) continue;
      const uuid = byName.get(norm(p.full_name));
      if (uuid) { await setMapping(p, uuid); matched++; }
    }
    setAutomapping(false);
    toast({ title: `Auto-mapped ${matched} ${matched === 1 ? 'employee' : 'employees'}`, description: matched ? undefined : 'No exact name matches found.' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold font-butler">Employee Mapping</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Match each worker to their Gusto employee. Unmapped workers are skipped when pushing hours.</p>
        </div>
        <Button size="sm" variant="outline" onClick={autoMap} disabled={automapping || loading || !employees.length} className="gap-1.5 shrink-0">
          {automapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Auto-map by name
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm min-w-[420px]">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Worker</th>
                <th className="text-left px-4 py-2.5 font-highway text-xs uppercase tracking-wider text-muted-foreground">Gusto Employee</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {profiles.map(p => (
                <tr key={p.id}>
                  <td className="px-4 py-2.5 font-medium">{p.full_name || p.email || 'Unnamed'}</td>
                  <td className="px-4 py-2.5">
                    <Select
                      value={p.gusto_employee_uuid || '__none__'}
                      onValueChange={(val) => setMapping(p, val === '__none__' ? null : val)}
                      disabled={savingId === p.id || !employees.length}
                    >
                      <SelectTrigger className="h-8 text-xs w-full max-w-[280px]">
                        <SelectValue placeholder="Select employee…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not mapped</SelectItem>
                        {employees.map(e => <SelectItem key={e.uuid} value={e.uuid}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                </tr>
              ))}
              {!profiles.length && <tr><td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">No active workers to map.</td></tr>}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}
