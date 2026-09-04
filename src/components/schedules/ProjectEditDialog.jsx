import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';

export default function ProjectEditDialog({ project, open, onOpenChange, onSaved }) {
  const [budgetHours, setBudgetHours] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (project) {
      setBudgetHours(project.budget_hours ?? '');
      setEndDate(project.target_end_date ?? '');
    }
  }, [project]);

  if (!project) return null;

  const handleSave = async () => {
    setSaving(true);
    await base44.entities.Project.update(project.id, {
      budget_hours: parseFloat(budgetHours) || 0,
      target_end_date: endDate || null,
    });
    setSaving(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{project.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Budget Hours</Label>
            <Input
              type="number"
              min="0"
              step="0.5"
              value={budgetHours}
              onChange={e => setBudgetHours(e.target.value)}
              placeholder="e.g. 500"
            />
          </div>
          <div>
            <Label>Estimated End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}