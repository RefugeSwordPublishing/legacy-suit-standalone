import { useState, useEffect } from 'react';
import { useCurrentUser } from '@/lib/UserContext';
import { base44 } from '@/api/base44Client';
import { FEATURES, PERMISSION_ROLES, useAllPermissions, getPermission, buildPermissionMap } from '@/lib/usePermissions';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import SettingsBack from '@/components/shared/SettingsBack';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Save, Lock, Info } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const ROLE_LABELS = {
  coo: 'Chief of Operations',
  site_manager: 'Site Manager',
  crew_member: 'Crew / Employee',
};

export default function Permissions() {
  const { currentUser } = useCurrentUser();
  const { records, map: savedMap, isLoading } = useAllPermissions();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Local draft state: { role_feature: { can_read, can_write } }
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Initialise draft from saved records + defaults when data loads
  useEffect(() => {
    if (isLoading) return;
    const initial = {};
    for (const role of PERMISSION_ROLES) {
      for (const feature of FEATURES) {
        const key = `${role}_${feature.key}`;
        initial[key] = getPermission(savedMap, role, feature.key);
      }
    }
    setDraft(initial);
    setDirty(false);
  }, [savedMap, isLoading]);

  if (currentUser?.role !== 'owner' && currentUser?.role !== 'admin') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <ShieldCheck className="w-10 h-10" />
        <p style={{ fontFamily: 'var(--font-butler)' }} className="text-lg">Owner or Admin access required</p>
      </div>
    );
  }

  const toggle = (role, feature, type) => {
    const key = `${role}_${feature}`;
    setDraft(prev => {
      const current = prev[key] || { can_read: false, can_write: false };
      let updated = { ...current, [type]: !current[type] };
      // If turning off read, also turn off write
      if (type === 'can_read' && !updated.can_read) updated.can_write = false;
      // If turning on write, also turn on read
      if (type === 'can_write' && updated.can_write) updated.can_read = true;
      return { ...prev, [key]: updated };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // For each role+feature combo, upsert the record
      for (const role of PERMISSION_ROLES) {
        for (const feature of FEATURES) {
          const key = `${role}_${feature.key}`;
          const perm = draft[key] || { can_read: false, can_write: false };
          const existing = records.find(r => r.role === role && r.feature === feature.key);
          if (existing) {
            await base44.entities.PermissionSettings.update(existing.id, {
              can_read: perm.can_read,
              can_write: perm.can_write,
            });
          } else {
            await base44.entities.PermissionSettings.create({
              role,
              feature: feature.key,
              can_read: perm.can_read,
              can_write: perm.can_write,
            });
          }
        }
      }
      await queryClient.invalidateQueries({ queryKey: ['permissionSettings'] });
      setDirty(false);
      toast({ title: 'Permissions saved', description: 'Role access updated successfully.' });
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    }
    setSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-7 h-7 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <SettingsBack />
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <h1 style={{ fontFamily: 'var(--font-butler)', fontSize: 26 }} className="text-foreground">
              Permissions
            </h1>
          </div>
          <p className="text-sm text-muted-foreground" style={{ fontFamily: 'var(--font-highway)' }}>
            Control which roles can read or write each feature area. Owner always has full access.
          </p>
        </div>
        <Button onClick={handleSave} disabled={!dirty || saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 mb-6 px-4 py-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-800">
        <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p className="text-sm" style={{ fontFamily: 'var(--font-highway)' }}>
          <strong>UI visibility only.</strong> These settings control what roles see and interact with in the app. All authenticated users can access the database, permissions control which features appear in the navigation and pages.
        </p>
      </div>

      {/* Matrix Table */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 w-44" style={{ fontFamily: 'var(--font-highway)', background: 'hsl(var(--background))' }}>
                Feature Area
              </th>
              {/* Owner column, locked */}
              <th className="px-4 py-3 text-center" style={{ background: 'hsl(var(--background))' }}>
                <div className="flex flex-col items-center gap-1">
                  <span style={{ fontFamily: 'var(--font-butler)', fontSize: 13 }}>Owner</span>
                  <Badge className="text-[9px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 normal-case tracking-normal">
                    Full Access
                  </Badge>
                </div>
              </th>
              {PERMISSION_ROLES.map(role => (
                <th key={role} className="px-4 py-3 text-center" style={{ background: 'hsl(var(--background))' }}>
                  <span style={{ fontFamily: 'var(--font-butler)', fontSize: 13 }}>{ROLE_LABELS[role]}</span>
                </th>
              ))}
            </tr>
            {/* Sub-header: Read / Write labels */}
            <tr className="border-b border-border bg-muted/40">
              <td className="px-4 py-1.5 text-xs text-muted-foreground uppercase tracking-widest">, </td>
              {/* Owner sub-header */}
              <td className="px-4 py-1.5">
                <div className="flex justify-center gap-6 text-[10px] uppercase tracking-widest text-muted-foreground">
                  <span>Read</span><span>Write</span>
                </div>
              </td>
              {PERMISSION_ROLES.map(role => (
                <td key={role} className="px-4 py-1.5">
                  <div className="flex justify-center gap-6 text-[10px] uppercase tracking-widest text-muted-foreground">
                    <span>Read</span><span>Write</span>
                  </div>
                </td>
              ))}
            </tr>
          </thead>
          <tbody>
            {FEATURES.map((feature, idx) => (
              <tr
                key={feature.key}
                className={`border-b border-border last:border-0 transition-colors ${idx % 2 === 0 ? 'bg-card' : 'bg-muted/20'}`}
              >
                <td className="px-4 py-3 font-medium" style={{ fontFamily: 'var(--font-highway)' }}>
                  {feature.label}
                </td>
                {/* Owner, always on, locked */}
                <td className="px-4 py-3">
                  <div className="flex justify-center items-center gap-6">
                    <div className="flex flex-col items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-primary/60" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Lock className="w-3.5 h-3.5 text-primary/60" />
                    </div>
                  </div>
                </td>
                {/* Editable roles */}
                {PERMISSION_ROLES.map(role => {
                  const key = `${role}_${feature.key}`;
                  const perm = draft[key] || { can_read: false, can_write: false };
                  return (
                    <td key={role} className="px-4 py-3">
                      <div className="flex justify-center items-center gap-6">
                        <Switch
                          checked={!!perm.can_read}
                          onCheckedChange={() => toggle(role, feature.key, 'can_read')}
                          className="data-[state=checked]:bg-primary"
                        />
                        <Switch
                          checked={!!perm.can_write}
                          onCheckedChange={() => toggle(role, feature.key, 'can_write')}
                          className="data-[state=checked]:bg-primary"
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground" style={{ fontFamily: 'var(--font-highway)' }}>
        * Enabling Write automatically enables Read. Disabling Read automatically disables Write.
        Navigation items and page access are hidden for roles without Read permission.
      </p>
    </div>
  );
}