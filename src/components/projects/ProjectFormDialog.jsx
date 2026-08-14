import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClipboardList } from 'lucide-react';
import { addDays, parseISO, isWeekend } from 'date-fns';
import ClientPicker from './ClientPicker';
import ProjectColorPicker from '@/components/schedules/ProjectColorPicker';
import ScheduleDatePicker from './ScheduleDatePicker';
import { useToast } from '@/components/ui/use-toast';
import { deriveInvoicePrefix } from '@/lib/invoiceNumber';
import AddressAutocomplete from '@/components/shared/AddressAutocomplete';

// Add N weekdays (skipping Sat/Sun) from a start date
function addWeekdays(start, n) {
  let date = new Date(start);
  let added = 0;
  while (added < n) {
    date = addDays(date, 1);
    if (!isWeekend(date)) added++;
  }
  return date;
}

function calcEndDate(startDate, durationValue, durationUnit) {
  if (!startDate || !durationValue || durationValue <= 0) return '';
  const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
  let end;
  if (durationUnit === 'weeks') {
    end = addDays(start, durationValue * 7 - 1);
  } else {
    end = addWeekdays(start, durationValue - 1);
  }
  return end.toISOString().split('T')[0];
}

const emptyProject = {
  name: '', address: '', client_name: '', status: 'planning',
  start_date: '', target_end_date: '', duration_value: '', duration_unit: 'days',
  budget: '', notes: '', site_manager_id: '', invoice_prefix: '', lockbox_code: '', latitude: '', longitude: ''
};

export default function ProjectFormDialog({ open, onOpenChange, onSaved, editProject }) {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const initial = editProject
    ? { ...editProject, budget: editProject.budget ? String(Math.round(Number(editProject.budget) * 100) / 100) : '', site_manager_id: editProject.site_manager_id || '', duration_value: editProject.duration_value || '', duration_unit: editProject.duration_unit || 'days' }
    : emptyProject;

  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const isEdit = !!editProject;
  const isHighRole = currentUser?.role === 'owner' || currentUser?.role === 'coo' || currentUser?.role === 'admin';

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.TaskTemplate.list(),
    enabled: open && !isEdit,
  });

  const { data: siteManagers = [] } = useQuery({
    queryKey: ['site-managers'],
    queryFn: () => base44.entities.UserProfile.filter({ role: 'site_manager' }),
    enabled: open && isHighRole,
  });

  const handleSave = async () => {
    setSaving(true);
    try {
      const computedEndDate = calcEndDate(form.start_date, Number(form.duration_value), form.duration_unit);
      const data = {
        ...form,
        budget: form.budget ? Math.round(Number(form.budget) * 100) / 100 : undefined,
        budget_hours: form.budget_hours ? Number(form.budget_hours) : undefined,
        latitude: form.latitude === '' || form.latitude == null ? null : Number(form.latitude),
        longitude: form.longitude === '' || form.longitude == null ? null : Number(form.longitude),
        duration_value: form.duration_value ? Number(form.duration_value) : undefined,
        target_end_date: computedEndDate || undefined,
      };

      // Remove any null/empty phase so it's truly unset
      if (!data.phase) delete data.phase;

      let projectId;
      if (isEdit) {
        await base44.entities.Project.update(editProject.id, data);
        projectId = editProject.id;
      } else {
        const created = await base44.entities.Project.create(data);
        projectId = created.id;
      }

      // If a site manager was assigned, add this project to their assigned_project_ids
      if (data.site_manager_id) {
        const smProfiles = await base44.entities.UserProfile.filter({ id: data.site_manager_id });
        if (smProfiles.length > 0) {
          const sm = smProfiles[0];
          const existing = sm.assigned_project_ids || [];
          if (!existing.includes(projectId)) {
            await base44.entities.UserProfile.update(sm.id, {
              assigned_project_ids: [...existing, projectId],
            });
          }
        }
      }

      // On new project creation: auto-import all phase-tagged templates + notify admins to schedule
      if (!isEdit) {
        const phaseTemplates = templates.filter(t => t.phase);
        for (const template of phaseTemplates) {
          for (const task of (template.tasks || [])) {
            await base44.entities.Task.create({
              project_id: projectId,
              title: task.title,
              priority: task.priority || 'medium',
              notes: task.notes || '',
              status: 'pending',
              phase: template.phase,
              subtasks: (task.subtasks || []).map(s => ({ ...s, completed: false })),
            });
          }
        }
      }

      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast({ title: 'Could not save project', description: e?.message || String(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Project' : 'New Project'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Project Name *</Label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Smith Residence Remodel" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Client</Label>
              <ClientPicker value={form.client_name} onChange={val => setForm({ ...form, client_name: val })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={val => setForm({ ...form, status: val })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="planning">Planning</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isHighRole && (
            <div>
              <Label>Site Manager</Label>
              <Select value={form.site_manager_id} onValueChange={val => setForm({ ...form, site_manager_id: val })}>
                <SelectTrigger><SelectValue placeholder="Assign site manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>Unassigned</SelectItem>
                  {siteManagers.map(sm => {
                    const fullName = [sm.first_name, sm.last_name].filter(Boolean).join(' ') || sm.email;
                    return (
                    <SelectItem key={sm.id} value={sm.id}>{fullName}</SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Address</Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(address) => setForm(f => ({ ...f, address, latitude: '', longitude: '', invoice_prefix: f.invoice_prefix ? f.invoice_prefix : deriveInvoicePrefix(address) }))}
              onCoords={(lat, lng) => setForm(f => ({ ...f, latitude: lat, longitude: lng }))}
              placeholder="Site address"
            />
          </div>
          <div>
            <Label className="flex items-center justify-between">
              Invoice Prefix
              <button
                type="button"
                onClick={() => setForm(f => ({ ...f, invoice_prefix: deriveInvoicePrefix(f.address) }))}
                className="text-xs text-accent hover:text-accent/80"
              >
                From address
              </button>
            </Label>
            <Input value={form.invoice_prefix || ''} onChange={e => setForm({ ...form, invoice_prefix: e.target.value })} placeholder="e.g. 4325Maple" />
            <p className="text-xs text-muted-foreground mt-0.5">Builds this project's invoice numbers, e.g. {(form.invoice_prefix || '4325Maple')}_001.</p>
          </div>
          <div>
            <Label>Lockbox / Gate Code</Label>
            <Input value={form.lockbox_code || ''} onChange={e => setForm({ ...form, lockbox_code: e.target.value })} placeholder="e.g. 1234" />
            <p className="text-xs text-muted-foreground mt-0.5">Optional. Shown in bold on the project card so crews can get on site.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Start Date</Label>
              <ScheduleDatePicker
                value={form.start_date}
                onChange={val => setForm({ ...form, start_date: val })}
                excludeProjectId={editProject?.id}
              />
            </div>
            <div>
              <Label>Budget ($)</Label>
              <Input type="number" value={form.budget} onChange={e => setForm({ ...form, budget: e.target.value })} placeholder="0" />
            </div>
          </div>
          <div>
            <Label>Budget Hours</Label>
            <Input type="number" value={form.budget_hours || ''} onChange={e => setForm({ ...form, budget_hours: e.target.value })} placeholder="e.g. 240" />
            <p className="text-xs text-muted-foreground mt-0.5">Total labor hours budgeted, used for the hours logged tracker</p>
          </div>
          {/* Duration */}
          <div>
            <Label>Timeframe</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={form.duration_value}
                onChange={e => setForm({ ...form, duration_value: e.target.value })}
                placeholder="e.g. 10"
                className="flex-1"
              />
              <Select value={form.duration_unit} onValueChange={val => setForm({ ...form, duration_unit: val })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Weekdays</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.start_date && form.duration_value > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Ends: <strong>{calcEndDate(form.start_date, Number(form.duration_value), form.duration_unit)
                  ? new Date(calcEndDate(form.start_date, Number(form.duration_value), form.duration_unit) + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : ''}</strong>
              </p>
            )}
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Project notes..." rows={3} />
          </div>

          {/* Color picker */}
          <div>
            <Label className="flex items-center justify-between mb-2">
              Timeline Color
              <button
                type="button"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="text-xs text-accent hover:text-accent/80"
              >
                {showColorPicker ? 'Hide' : 'Show'}
              </button>
            </Label>
            {showColorPicker && (
              <ProjectColorPicker color={form.color || '#3B82F6'} onChange={val => setForm({ ...form, color: val })} />
            )}
            {!showColorPicker && (
              <div className="w-full h-10 rounded-lg border border-input" style={{ backgroundColor: form.color || '#3B82F6' }} />
            )}
          </div>

          {/* Info about auto-import, new projects only */}
          {!isEdit && templates.filter(t => t.phase).length > 0 && (
            <div className="pt-1 rounded-lg border border-border bg-muted/30 px-3 py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <ClipboardList className="w-3.5 h-3.5 shrink-0" />
                <span><strong>{templates.filter(t => t.phase).length} phase template{templates.filter(t => t.phase).length !== 1 ? 's' : ''}</strong> will be auto-imported for all 6 phases on creation.</span>
              </p>
            </div>
          )}

          <Button onClick={handleSave} disabled={!form.name || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
            {saving ? 'Saving...' : isEdit ? 'Update Project' : 'Create Project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}