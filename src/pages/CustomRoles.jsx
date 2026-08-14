import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Plus, Trash2, Loader2, Info } from 'lucide-react';
import SettingsBack from '@/components/shared/SettingsBack';

// Permission tiers a custom role can map to. Owner is the account holder and not assignable.
export const PERMISSION_TIERS = [
  { value: 'admin', label: 'Admin', hint: 'Full access, like the owner' },
  { value: 'coo', label: 'Office / COO', hint: 'Full access to office + field' },
  { value: 'site_manager', label: 'Manager', hint: 'Manages crew, timecards, assigned projects' },
  { value: 'foreman', label: 'Foreman', hint: 'Field lead' },
  { value: 'crew_member', label: 'Crew', hint: 'Clocks in, sees assigned tasks' },
];
const tierLabel = (v) => PERMISSION_TIERS.find(t => t.value === v)?.label || v;

export default function CustomRoles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState('crew_member');
  const [saving, setSaving] = useState(false);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['custom-roles'],
    queryFn: () => base44.entities.CustomRole.list('sort_order', 100),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['custom-roles'] });

  const add = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await base44.entities.CustomRole.create({ label: label.trim(), base_role: tier, sort_order: roles.length });
      setLabel(''); setTier('crew_member');
      invalidate();
    } catch (e) { toast({ title: 'Could not add role', description: e.message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  const patch = async (id, updates) => {
    try { await base44.entities.CustomRole.update(id, updates); invalidate(); }
    catch (e) { toast({ title: 'Could not update', description: e.message, variant: 'destructive' }); }
  };

  const remove = async (r) => {
    if (!window.confirm(`Delete the "${r.label}" role? Users assigned it keep their access; you just can't pick it for new assignments.`)) return;
    try { await base44.entities.CustomRole.delete(r.id); invalidate(); }
    catch (e) { toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-5">
      <SettingsBack />
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <ShieldCheck className="w-7 h-7" /> Roles
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Name the roles your company uses. Assign them to people on the Users page.</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
        <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground font-medium mb-1">How this works</p>
          Each role has a name you choose (like "Job Foreman") and a <strong>permission level</strong> it maps to. The name shows throughout the app; the permission level controls what that person can see and do. So you can call it "Job Foreman" while it has Manager-level access.
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_190px_auto] gap-3 items-end">
          <div>
            <Label>Role name</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Job Foreman, Lead Carpenter" onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div>
            <Label>Permission level</Label>
            <Select value={tier} onValueChange={setTier}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERMISSION_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={add} disabled={saving || !label.trim()} className="gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {roles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No roles yet.</p>}
          {roles.map(r => (
            <div key={r.id} className="flex items-center gap-2 px-4 py-3">
              <Input defaultValue={r.label} onBlur={e => e.target.value.trim() && e.target.value !== r.label && patch(r.id, { label: e.target.value.trim() })} className="flex-1 h-8 min-w-0" />
              <Select value={r.base_role} onValueChange={v => patch(r.id, { base_role: v })}>
                <SelectTrigger className="w-36 h-8 text-sm shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERMISSION_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={r.pay_type || 'hourly'} onValueChange={v => patch(r.id, { pay_type: v })}>
                <SelectTrigger className="w-28 h-8 text-sm shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="hourly">Hourly</SelectItem>
                  <SelectItem value="salary">Salary</SelectItem>
                </SelectContent>
              </Select>
              <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
