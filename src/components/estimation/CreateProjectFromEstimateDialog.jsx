import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FolderPlus, HardHat, Clock } from 'lucide-react';

export default function CreateProjectFromEstimateDialog({ open, onOpenChange, estimate, onCreated, onSkip }) {
  const [name, setName] = useState(estimate?.title || '');
  const [saving, setSaving] = useState(false);

  const laborHourRate = Number(localStorage.getItem('estimateLaborHourRate') || '40') || 40;

  // Sum labor line_total values, then divide by the configured labor hour rate
  const laborTotal = (estimate?.sections || [])
    .flatMap(s => s.line_items || [])
    .filter(i => i.category === 'labor')
    .reduce((sum, i) => sum + (Number(i.line_total) || 0), 0);

  const laborHours = laborHourRate > 0 ? Math.round((laborTotal / laborHourRate) * 10) / 10 : 0;

  const handleCreate = async () => {
    if (!name.trim()) return;
    setSaving(true);
    const project = await base44.entities.Project.create({
      name: name.trim(),
      client_name: estimate?.client_name || '',
      budget: Math.round((estimate?.grand_total || 0) * 100) / 100,
      budget_hours: laborHours > 0 ? laborHours : undefined,
      status: 'planning',
    });
    setSaving(false);
    onCreated(project);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-primary" />
            Create Project from Estimate
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-1 mb-2">
          This estimate was approved. Would you like to create a new project for it?
        </p>

        <div className="space-y-3">
          <div>
            <Label>Project Name</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Smith Residence Remodel"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                <HardHat className="w-3 h-3" /> Budget
              </p>
              <p className="text-sm font-semibold">
                ${(estimate?.grand_total || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="bg-muted/40 rounded-lg px-3 py-2">
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-0.5">
                <Clock className="w-3 h-3" /> Labor Hours
              </p>
              <p className="text-sm font-semibold">
                {laborHours > 0 ? `${laborHours} hrs` : ''}
              </p>
            </div>
          </div>

          {laborHours > 0 && (
            <p className="text-xs text-muted-foreground">
              Budget hours = ${laborTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} labor ÷ ${laborHourRate}/hr = <strong>{laborHours} hrs</strong>
            </p>
          )}
        </div>

        <div className="flex gap-2 mt-2">
          <Button variant="outline" className="flex-1" onClick={onSkip}>Skip</Button>
          <Button className="flex-1" disabled={!name.trim() || saving} onClick={handleCreate}>
            {saving ? 'Creating...' : 'Create Project'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}