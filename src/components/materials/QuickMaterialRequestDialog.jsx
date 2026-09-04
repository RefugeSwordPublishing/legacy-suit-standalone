import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, AlertTriangle, Clock, Calendar } from 'lucide-react';
import { sortByName } from '@/lib/naturalSort';

const PRIORITY_OPTIONS = [
  { value: 'urgent', label: 'ASAP', icon: AlertTriangle, className: 'bg-red-100 text-red-700 border-red-200' },
  { value: 'high', label: 'Tomorrow', icon: Clock, className: 'bg-amber-100 text-amber-700 border-amber-200' },
  { value: 'medium', label: 'Later', icon: Calendar, className: 'bg-blue-100 text-blue-700 border-blue-200' },
];

const emptyItem = () => ({ name: '', quantity: '', unit: '', notes: '' });

// lockedProject ({id, name}) pins the request to one project and hides the picker (used from a
// project's page so the form matches the dashboard's).
export default function QuickMaterialRequestDialog({ open, onOpenChange, projects, onSaved, lockedProject }) {
  const [projectId, setProjectId] = useState(lockedProject?.id || '');
  const [priority, setPriority] = useState('urgent');
  const [items, setItems] = useState([emptyItem()]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (lockedProject?.id) setProjectId(lockedProject.id); }, [lockedProject?.id, open]);

  const updateItem = (index, field, value) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => setItems(prev => [emptyItem(), ...prev]);

  const removeItem = (index) => setItems(prev => prev.filter((_, i) => i !== index));

  const handleSave = async () => {
    const validItems = items.filter(i => i.name.trim());
    if (!projectId || validItems.length === 0) return;

    setSaving(true);
    await Promise.all(
      validItems.map(item =>
        base44.entities.Material.create({
          project_id: projectId,
          name: item.name.trim(),
          quantity: item.quantity ? Number(item.quantity) : undefined,
          unit: item.unit || undefined,
          notes: item.notes || undefined,
          priority,
          status: 'needed',
        })
      )
    );
    // Notify owners/COOs that materials were requested. To avoid blowing up the notification list
    // during a busy stretch, roll requests for the same project into a single unread notification
    // within a 4-hour window: update the count instead of creating a new one (and no repeat push).
    const projectName = lockedProject?.name || projects.find(p => p.id === projectId)?.name || 'a project';
    const GROUP_WINDOW_MS = 4 * 60 * 60 * 1000;
    const now = Date.now();
    try {
      const owners = await base44.entities.UserProfile.filter({ role: 'owner' });
      const coos = await base44.entities.UserProfile.filter({ role: 'coo' });
      await Promise.all([...owners, ...coos].filter(p => p.user_id).map(async (p) => {
        try {
          const [recent] = await base44.entities.Notification.filter(
            { user_id: p.user_id, type: 'material_added', project_id: projectId, read: false },
            '-created_at', 1
          );
          if (recent?.created_at && (now - new Date(recent.created_at).getTime()) < GROUP_WINDOW_MS) {
            const prev = parseInt(String(recent.message).match(/^(\d+)/)?.[1] || '0', 10) || 0;
            const total = prev + validItems.length;
            await base44.entities.Notification.update(recent.id, {
              title: `New Material${total > 1 ? 's' : ''} Requested`,
              message: `${total} material(s) requested for ${projectName}`,
              created_at: new Date().toISOString(),
            });
          } else {
            await base44.entities.Notification.create({
              user_id: p.user_id,
              type: 'material_added',
              title: `New Material${validItems.length > 1 ? 's' : ''} Requested`,
              message: `${validItems.length} material(s) requested for ${projectName}`,
              project_id: projectId,
              project_name: projectName,
              read: false,
            });
          }
        } catch (_e) { /* per-recipient, non-blocking */ }
      }));
    } catch (_e) { /* non-blocking */ }
    setSaving(false);
    // Reset
    setProjectId(lockedProject?.id || '');
    setPriority('urgent');
    setItems([emptyItem()]);
    onOpenChange(false);
    onSaved();
  };

  const canSubmit = projectId && items.some(i => i.name.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Material Request</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Project selector (hidden when the request is pinned to a project) */}
          {!lockedProject && (
            <div>
              <Label>Project *</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a project..." />
                </SelectTrigger>
                <SelectContent>
                  {sortByName(projects).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Priority */}
          <div>
            <Label>Priority *</Label>
            <div className="flex gap-2 mt-1.5">
              {PRIORITY_OPTIONS.map(opt => {
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setPriority(opt.value)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                      priority === opt.value
                        ? opt.className
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Material items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Materials *</Label>
              <button onClick={addItem} className="text-xs text-accent hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add item
              </button>
            </div>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div key={index} className="border border-border rounded-lg p-3 space-y-2 bg-muted/20">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        placeholder="Material name *"
                        value={item.name}
                        onChange={e => updateItem(index, 'name', e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="Qty"
                        type="number"
                        value={item.quantity}
                        onChange={e => updateItem(index, 'quantity', e.target.value)}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        placeholder="Unit"
                        value={item.unit}
                        onChange={e => updateItem(index, 'unit', e.target.value)}
                      />
                    </div>
                    {items.length > 1 && (
                      <button onClick={() => removeItem(index)} className="text-muted-foreground hover:text-destructive mt-2">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <Input
                    placeholder="Notes (optional)"
                    value={item.notes}
                    onChange={e => updateItem(index, 'notes', e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleSave}
            disabled={!canSubmit || saving}
            className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {saving ? 'Submitting...' : `Submit ${items.filter(i => i.name.trim()).length || ''} Material Request${items.filter(i => i.name.trim()).length > 1 ? 's' : ''}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}