import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { differenceInCalendarDays, format, parseISO } from 'date-fns';
import { useToast } from '@/components/ui/use-toast';
import ScheduleDatePicker from '@/components/projects/ScheduleDatePicker';
import { calcEndDate, formatShortDate, planCrewShift, shiftWeekdays, weekdaysBetween } from '@/lib/projectDates';

const TASK_DATE_FIELDS = ['due_date', 'eta_start', 'eta_end'];

// Quick schedule edit from the Project Schedules calendar: budget hours, start date, timeframe and
// end date. Pushing the start back moves the end with it, recalculated from the timeframe when
// there is one, otherwise shifted by the same number of weekdays so the job keeps its length. Open
// tasks and upcoming crew assignments (with their daily goals) shift by those weekdays too. Completed
// tasks and past assignments keep their dates. Subcontractor dates are left for the office to move.
export default function ProjectEditDialog({ project, open, onOpenChange, onSaved }) {
  const [budgetHours, setBudgetHours] = useState('');
  const [startDate, setStartDate] = useState('');
  const [durationValue, setDurationValue] = useState('');
  const [durationUnit, setDurationUnit] = useState('days');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [moveTasks, setMoveTasks] = useState(true);
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: projectTasks = [] } = useQuery({
    queryKey: ['tasks', project?.id],
    queryFn: () => base44.entities.Task.filter({ project_id: project.id }),
    enabled: !!project?.id && open,
  });
  const { data: crewEntries = [] } = useQuery({
    queryKey: ['crew-schedule', 'project', project?.id],
    queryFn: () => base44.entities.CrewScheduleEntry.filter({ project_id: project.id }),
    enabled: !!project?.id && open,
  });
  const { data: approvedTimeOff = [] } = useQuery({
    queryKey: ['time-off-approved'],
    queryFn: () => base44.entities.TimeOffRequest.filter({ status: 'approved' }),
    enabled: !!project?.id && open,
  });

  useEffect(() => {
    if (project) {
      setMoveTasks(true);
      setBudgetHours(project.budget_hours ?? '');
      setStartDate(project.start_date ?? '');
      setDurationValue(project.duration_value ?? '');
      setDurationUnit(project.duration_unit || 'days');
      setEndDate(project.target_end_date ?? '');
    }
  }, [project]);

  if (!project) return null;

  const recalcEnd = (start, value, unit) => {
    const computed = calcEndDate(start, Number(value), unit);
    if (computed) setEndDate(computed);
  };

  const handleStartChange = (next) => {
    if (!next) return setStartDate('');
    if (Number(durationValue) > 0) {
      recalcEnd(next, durationValue, durationUnit);
    } else if (startDate && endDate) {
      setEndDate(shiftWeekdays(endDate, weekdaysBetween(startDate, next)));
    }
    setStartDate(next);
  };

  const handleDurationChange = (value) => {
    setDurationValue(value);
    recalcEnd(startDate, value, durationUnit);
  };

  const handleUnitChange = (unit) => {
    setDurationUnit(unit);
    recalcEnd(startDate, durationValue, unit);
  };

  const endBeforeStart = startDate && endDate && endDate < startDate;
  const moved = project.start_date && startDate && startDate !== project.start_date
    ? differenceInCalendarDays(parseISO(startDate), parseISO(project.start_date))
    : 0;

  // Work days the start moved, measured from the saved start, and the open dated tasks that follow.
  const shift = project.start_date && startDate ? weekdaysBetween(project.start_date, startDate) : 0;
  const tasksToMove = shift
    ? projectTasks.filter(t => t.status !== 'completed' && TASK_DATE_FIELDS.some(k => t[k]))
    : [];
  // Days already worked stay put; they are what the timecards were logged against.
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const dayOf = (e) => String(e.scheduled_date).slice(0, 10);
  const entriesToMove = shift ? crewEntries.filter(e => e.scheduled_date && dayOf(e) >= todayStr) : [];
  const timeOffClashes = entriesToMove.filter(e => {
    const d = shiftWeekdays(dayOf(e), shift);
    return approvedTimeOff.some(r => r.user_id === e.user_id && d >= r.start_date && d <= r.end_date);
  });
  const somethingToMove = tasksToMove.length + entriesToMove.length > 0;

  // planCrewShift decides which entries can move without doubling someone up on a day and orders
  // the writes so none collides mid-way (the table allows one entry per person, project and day).
  const moveCrewEntries = async () => {
    const plan = planCrewShift(
      crewEntries.filter(e => e.scheduled_date).map(e => ({ id: e.id, user_id: e.user_id, date: dayOf(e) })),
      new Set(entriesToMove.map(e => e.id)),
      shift,
    );
    const moved = new Map();
    let skipped = plan.stay.length;
    for (const m of plan.moves) {
      try {
        await base44.entities.CrewScheduleEntry.update(m.id, { scheduled_date: m.to });
        moved.set(m.id, m.to);
      } catch {
        skipped++;
      }
    }
    if (moved.size) {
      const goals = await base44.entities.DailyGoal.filter({ project_id: project.id });
      await Promise.all(goals.filter(g => moved.has(g.schedule_entry_id))
        .map(g => base44.entities.DailyGoal.update(g.id, { scheduled_date: moved.get(g.schedule_entry_id) })));
    }
    return { moved: moved.size, skipped };
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (moveTasks && tasksToMove.length) {
        await Promise.all(tasksToMove.map(t => base44.entities.Task.update(t.id, Object.fromEntries(
          TASK_DATE_FIELDS.filter(k => t[k]).map(k => [k, shiftWeekdays(String(t[k]).slice(0, 10), shift)]),
        ))));
        qc.invalidateQueries({ queryKey: ['tasks'] });
      }
      let crew = { moved: 0, skipped: 0 };
      if (moveTasks && entriesToMove.length) {
        crew = await moveCrewEntries();
        qc.invalidateQueries({ queryKey: ['crew-schedule'] });
        qc.invalidateQueries({ queryKey: ['daily-goals-today'] });
      }
      await base44.entities.Project.update(project.id, {
        budget_hours: parseFloat(budgetHours) || 0,
        start_date: startDate || null,
        duration_value: Number(durationValue) > 0 ? Number(durationValue) : null,
        duration_unit: durationUnit,
        target_end_date: endDate || null,
      });
      if (crew.skipped) {
        toast({
          title: `${crew.skipped} crew assignment${crew.skipped === 1 ? '' : 's'} not moved`,
          description: 'Each would have put someone on this job twice in one day, usually weekend work folding onto a weekday. They stayed on their old dates; check the crew schedule.',
          variant: 'destructive',
        });
      }
      onSaved?.();
    } finally {
      setSaving(false);
    }
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
            <Label>Start Date</Label>
            <ScheduleDatePicker value={startDate} onChange={handleStartChange} excludeProjectId={project.id} />
            {moved !== 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {Math.abs(moved)} day{Math.abs(moved) === 1 ? '' : 's'} {moved > 0 ? 'later' : 'earlier'} than {formatShortDate(project.start_date)}.
              </p>
            )}
            {somethingToMove && (
              <label className="flex items-start gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
                <Checkbox checked={moveTasks} onCheckedChange={v => setMoveTasks(!!v)} className="mt-0.5" />
                <span>
                  Move {[
                    tasksToMove.length > 0 && `${tasksToMove.length} open task${tasksToMove.length === 1 ? '' : 's'}`,
                    entriesToMove.length > 0 && `${entriesToMove.length} upcoming crew assignment${entriesToMove.length === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' and ')} {Math.abs(shift)} work day{Math.abs(shift) === 1 ? '' : 's'} {shift > 0 ? 'later' : 'earlier'} too.
                  Completed tasks, past crew days and subcontractor dates stay where they are.
                  {moveTasks && timeOffClashes.length > 0 && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      {timeOffClashes.length} assignment{timeOffClashes.length === 1 ? '' : 's'} will land on approved time off: {[...new Set(timeOffClashes.map(e => e.user_name || 'a crew member'))].join(', ')}.
                    </span>
                  )}
                </span>
              </label>
            )}
          </div>
          <div>
            <Label>Timeframe</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min="1"
                value={durationValue}
                onChange={e => handleDurationChange(e.target.value)}
                placeholder="e.g. 10"
                className="flex-1"
              />
              <Select value={durationUnit} onValueChange={handleUnitChange}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">Weekdays</SelectItem>
                  <SelectItem value="weeks">Weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Estimated End Date</Label>
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
            {endBeforeStart && (
              <p className="text-xs text-destructive mt-1">The end date is before the start date.</p>
            )}
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || endBeforeStart} className="flex-1">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
