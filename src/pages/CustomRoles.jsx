import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { ShieldCheck, Plus, Trash2, Loader2, Info, ChevronDown, ChevronRight, Save, SlidersHorizontal } from 'lucide-react';
import SettingsBack from '@/components/shared/SettingsBack';
import { FEATURES, useAllPermissions, getEffectivePermission } from '@/lib/usePermissions';

// Permission tiers a custom role can map to. Owner is the account holder and not assignable.
export const PERMISSION_TIERS = [
  { value: 'admin', label: 'Admin', hint: 'Full access, like the owner' },
  { value: 'coo', label: 'Office / COO', hint: 'Full access to office + field' },
  { value: 'site_manager', label: 'Manager', hint: 'Manages crew, timecards, assigned projects' },
  { value: 'foreman', label: 'Foreman', hint: 'Field lead' },
  { value: 'crew_member', label: 'Crew', hint: 'Clocks in, sees assigned tasks' },
];
const tierLabel = (v) => PERMISSION_TIERS.find(t => t.value === v)?.label || v;

// Per-role access editor: read/write toggles for every feature, seeded from the role's tier default
// (or its own saved overrides). Saving writes per-custom-role permission_settings rows that auth_can()
// resolves ahead of the tier default, so this is enforced at the DB, not just the UI.
function RoleAccessEditor({ role, records, map, roleMap, onSaved }) {
  const { toast } = useToast();
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const initial = {};
    for (const f of FEATURES) {
      initial[f.key] = getEffectivePermission(map, roleMap, { role: role.base_role, custom_role_id: role.id }, f.key);
    }
    setDraft(initial);
    setDirty(false);
  }, [role.id, role.base_role, map, roleMap]);

  if (role.base_role === 'admin') {
    return (
      <div className="px-4 py-3 text-sm text-muted-foreground bg-muted/20 border-t border-border">
        Admin-tier roles always have full access and can't be restricted.
      </div>
    );
  }

  const toggle = (feature, type) => {
    setDraft(prev => {
      const cur = prev[feature] || { can_read: false, can_write: false };
      const up = { ...cur, [type]: !cur[type] };
      if (type === 'can_read' && !up.can_read) up.can_write = false;   // no read -> no write
      if (type === 'can_write' && up.can_write) up.can_read = true;    // write implies read
      return { ...prev, [feature]: up };
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const f of FEATURES) {
        const perm = draft[f.key] || { can_read: false, can_write: false };
        const existing = records.find(r => r.custom_role_id === role.id && r.feature === f.key);
        if (existing) {
          await base44.entities.PermissionSettings.update(existing.id, { can_read: perm.can_read, can_write: perm.can_write });
        } else {
          await base44.entities.PermissionSettings.create({
            custom_role_id: role.id, role: role.base_role, feature: f.key,
            can_read: perm.can_read, can_write: perm.can_write,
          });
        }
      }
      await onSaved();
      setDirty(false);
      toast({ title: 'Access saved', description: `Updated what "${role.label}" can see and do.` });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  const resetToTier = async () => {
    const overrides = records.filter(r => r.custom_role_id === role.id);
    if (!overrides.length) { toast({ title: 'Already using tier defaults' }); return; }
    if (!window.confirm(`Reset "${role.label}" back to the ${tierLabel(role.base_role)} tier defaults? This removes its custom overrides.`)) return;
    setSaving(true);
    try {
      for (const r of overrides) await base44.entities.PermissionSettings.delete(r.id);
      await onSaved();
      toast({ title: 'Reset to tier defaults' });
    } catch (e) {
      toast({ title: 'Reset failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  return (
    <div className="border-t border-border bg-muted/10">
      <div className="px-4 py-3">
        <div className="hidden sm:grid grid-cols-[1fr_60px_60px] gap-2 px-2 pb-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Feature</span><span className="text-center">Read</span><span className="text-center">Write</span>
        </div>
        <div className="divide-y divide-border/60">
          {FEATURES.map(f => {
            const perm = draft[f.key] || { can_read: false, can_write: false };
            return (
              <div key={f.key} className="grid grid-cols-[1fr_60px_60px] gap-2 items-center px-2 py-2">
                <span className="text-sm text-foreground">{f.label}</span>
                <div className="flex justify-center">
                  <Switch checked={!!perm.can_read} onCheckedChange={() => toggle(f.key, 'can_read')} className="data-[state=checked]:bg-primary" />
                </div>
                <div className="flex justify-center">
                  <Switch checked={!!perm.can_write} onCheckedChange={() => toggle(f.key, 'can_write')} className="data-[state=checked]:bg-primary" />
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 mt-3">
          <button onClick={resetToTier} disabled={saving} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">
            Reset to {tierLabel(role.base_role)} defaults
          </button>
          <Button size="sm" onClick={save} disabled={!dirty || saving} className="gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save access
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Enabling Write turns on Read. Features left at the tier default aren't overridden. Enforced at the database, not just hidden in the UI.
        </p>
      </div>
    </div>
  );
}

export default function CustomRoles() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [label, setLabel] = useState('');
  const [tier, setTier] = useState('crew_member');
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

  const { data: roles = [], isLoading } = useQuery({
    queryKey: ['custom-roles'],
    queryFn: () => base44.entities.CustomRole.list('sort_order', 100),
  });
  const { records, map, roleMap } = useAllPermissions();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['custom-roles'] });
  const invalidatePerms = () => queryClient.invalidateQueries({ queryKey: ['permissionSettings'] });

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
    try { await base44.entities.CustomRole.delete(r.id); invalidate(); invalidatePerms(); }
    catch (e) { toast({ title: 'Could not delete', description: e.message, variant: 'destructive' }); }
  };

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto space-y-5">
      <SettingsBack />
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <ShieldCheck className="w-7 h-7" /> Roles
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Name the roles your company uses, set what each can access, and assign them to people on the Users page.</p>
      </div>

      <div className="rounded-lg border border-border bg-muted/30 p-4 flex gap-3">
        <Info className="w-5 h-5 text-accent shrink-0 mt-0.5" />
        <div className="text-sm text-muted-foreground leading-relaxed">
          <p className="text-foreground font-medium mb-1">How this works</p>
          Each role has a name you choose (like "Job Foreman") and a <strong>permission tier</strong> it starts from. Use <strong>Access</strong> to fine-tune exactly what that role can see and do, feature by feature, overriding the tier default only where you want.
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg p-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_190px_auto] gap-3 items-end">
          <div>
            <Label>Role name</Label>
            <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Job Foreman, Lead Carpenter" onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div>
            <Label>Permission tier</Label>
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
        <div className="bg-card border border-border rounded-lg divide-y divide-border overflow-hidden">
          {roles.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No roles yet.</p>}
          {roles.map(r => {
            const overrideCount = records.filter(rec => rec.custom_role_id === r.id).length;
            const expanded = expandedId === r.id;
            return (
              <div key={r.id}>
                <div className="flex items-center gap-2 px-4 py-3">
                  <Input defaultValue={r.label} onBlur={e => e.target.value.trim() && e.target.value !== r.label && patch(r.id, { label: e.target.value.trim() })} className="flex-1 h-8 min-w-0" />
                  <Select value={r.base_role} onValueChange={v => patch(r.id, { base_role: v })}>
                    <SelectTrigger className="w-32 h-8 text-sm shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERMISSION_TIERS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={r.pay_type || 'hourly'} onValueChange={v => patch(r.id, { pay_type: v })}>
                    <SelectTrigger className="w-24 h-8 text-sm shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hourly">Hourly</SelectItem>
                      <SelectItem value="salary">Salary</SelectItem>
                    </SelectContent>
                  </Select>
                  <button
                    onClick={() => setExpandedId(expanded ? null : r.id)}
                    className={`flex items-center gap-1 text-xs shrink-0 px-2 py-1.5 rounded-md border transition-colors ${expanded ? 'border-primary text-primary bg-primary/5' : 'border-border text-muted-foreground hover:text-foreground'}`}
                    title="Customize this role's access"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Access</span>
                    {overrideCount > 0 && <span className="ml-0.5 rounded-full bg-primary/15 text-primary text-[10px] px-1.5">{overrideCount}</span>}
                    {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={() => remove(r)} className="text-muted-foreground hover:text-destructive shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {expanded && (
                  <RoleAccessEditor role={r} records={records} map={map} roleMap={roleMap} onSaved={invalidatePerms} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
