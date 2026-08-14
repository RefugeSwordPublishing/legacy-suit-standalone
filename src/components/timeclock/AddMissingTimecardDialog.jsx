import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PlusCircle } from 'lucide-react';
import { sortByName } from '@/lib/naturalSort';
import { findOverlap } from '@/lib/timeEntries';

export default function AddMissingTimecardDialog({ open, onOpenChange, onSuccess }) {
  const today = format(new Date(), 'yyyy-MM-dd');

  const [form, setForm] = useState({
    user_id: '',
    project_id: '',
    date: today,
    clock_in_time: '08:00',
    clock_out_time: '17:00',
    notes: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: userProfiles = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.filter({ status: 'active' }),
  });

  const allProjects = useQuery({
    queryKey: ['all-projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const availableProjects = allProjects.data || [];

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    setError('');
    if (!form.user_id || !form.project_id || !form.date || !form.clock_in_time || !form.clock_out_time) {
      setError('Please fill in all required fields.');
      return;
    }

    const clockInISO = new Date(`${form.date}T${form.clock_in_time}:00`).toISOString();
    const clockOutISO = new Date(`${form.date}T${form.clock_out_time}:00`).toISOString();

    if (new Date(clockOutISO) <= new Date(clockInISO)) {
      setError('Clock out time must be after clock in time.');
      return;
    }

    const profile = userProfiles.find(u => u.user_id === form.user_id);
    const project = availableProjects.find(p => p.id === form.project_id);

    setLoading(true);

    // Block entries that overlap time this person is already clocked for that day.
    const dayEntries = await base44.entities.TimeEntry.filter({ user_id: form.user_id, date: form.date });
    const conflict = findOverlap(dayEntries, form.user_id, clockInISO, clockOutISO, null);
    if (conflict) {
      const cin = conflict.clock_in ? format(new Date(conflict.clock_in), 'h:mm a') : '?';
      const cout = conflict.clock_out ? format(new Date(conflict.clock_out), 'h:mm a') : 'open';
      setError(`${profile?.full_name || 'This person'} already has time from ${cin} to ${cout} that day. Adjust the times or edit that entry instead.`);
      setLoading(false);
      return;
    }

    const duration_minutes = Math.round((new Date(clockOutISO) - new Date(clockInISO)) / 60000);
    const entry = await base44.entities.TimeEntry.create({
      user_id: form.user_id,
      user_name: profile?.full_name || form.user_id,
      user_role: profile?.role || '',
      project_id: form.project_id,
      project_name: project?.name || '',
      clock_in: clockInISO,
      clock_out: clockOutISO,
      date: form.date,
      duration_minutes,
      status: 'clocked_out',
      location_overridden: true,
      notes: form.notes,
    });

    // Sync to Google Sheets
    await base44.functions.invoke('syncTimecardToSheets', { data: entry });

    setLoading(false);
    setForm({ user_id: '', project_id: '', date: today, clock_in_time: '08:00', clock_out_time: '17:00', notes: '' });
    onSuccess?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-accent" /> Add Missing Timecard
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Employee */}
          <div className="space-y-1.5">
            <Label>Employee <span className="text-red-500">*</span></Label>
            <Select value={form.user_id} onValueChange={v => set('user_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent>
                {userProfiles.map(u => (
                  <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project */}
          <div className="space-y-1.5">
            <Label>Project <span className="text-red-500">*</span></Label>
            <Select value={form.project_id} onValueChange={v => set('project_id', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select project..." />
              </SelectTrigger>
              <SelectContent>
                {sortByName(availableProjects).map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <Label>Date <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={form.date}
              max={today}
              onChange={e => set('date', e.target.value)}
            />
          </div>

          {/* Clock In / Clock Out */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Clock In <span className="text-red-500">*</span></Label>
              <Input
                type="time"
                value={form.clock_in_time}
                onChange={e => set('clock_in_time', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Clock Out <span className="text-red-500">*</span></Label>
              <Input
                type="time"
                value={form.clock_out_time}
                onChange={e => set('clock_out_time', e.target.value)}
              />
            </div>
          </div>

          {/* Duration preview */}
          {form.clock_in_time && form.clock_out_time && form.date && (() => {
            const mins = Math.round((new Date(`${form.date}T${form.clock_out_time}`) - new Date(`${form.date}T${form.clock_in_time}`)) / 60000);
            if (mins <= 0) return null;
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return (
              <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                Duration: <span className="font-semibold text-foreground">{h > 0 ? `${h}h ` : ''}{m}m</span>
              </p>
            );
          })()}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes..."
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? 'Saving...' : 'Add Timecard'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}