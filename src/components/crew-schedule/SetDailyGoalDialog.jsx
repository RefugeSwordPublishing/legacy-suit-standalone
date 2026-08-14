import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Target, Loader2, CheckCircle2, Layers, ListChecks } from 'lucide-react';
import { format } from 'date-fns';

const PHASES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'];

const PHASE_COLORS = {
  phase_1: 'bg-violet-100 text-violet-700',
  phase_2: 'bg-blue-100 text-blue-700',
  phase_3: 'bg-cyan-100 text-cyan-700',
  phase_4: 'bg-amber-100 text-amber-700',
  phase_5: 'bg-orange-100 text-orange-700',
  phase_6: 'bg-emerald-100 text-emerald-700',
};

const PRIORITY_COLORS = {
  urgent: 'bg-red-100 text-red-700',
  high: 'bg-orange-100 text-orange-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
};

// Any active (non-completed) item on the project is selectable as a daily goal, regardless of
// who it is currently assigned to (a task can need more than one person). Setting it assigns
// this person and marks the task active. Tasks with subtasks expose each incomplete subtask.
// id format: task items => taskId, subtask items => `taskId::subtaskId`
function buildSelectableItems(taskList) {
  const currentItems = [];

  taskList.forEach(task => {
    if (task.status === 'completed') return;

    const subtasks = task.subtasks || [];
    const incompleteSubtasks = subtasks.filter(st => !st.completed);

    if (incompleteSubtasks.length > 0) {
      incompleteSubtasks.forEach(st => {
        currentItems.push({
          id: `${task.id}::${st.id}`,
          label: st.title,
          sublabel: task.title,
          phase: task.phase,
          priority: task.priority,
          taskId: task.id,
          subtaskId: st.id,
          isSubtask: true,
          assignedTo: st.assigned_to || null,
        });
      });
    } else {
      currentItems.push({
        id: task.id,
        label: task.title,
        sublabel: task.notes || null,
        phase: task.phase,
        priority: task.priority,
        status: task.status,
        taskId: task.id,
        isSubtask: false,
        assignedTo: task.assigned_to || null,
      });
    }
  });

  return currentItems;
}

export default function SetDailyGoalDialog({ open, onOpenChange, entry, project, userName }) {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [items, setItems] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [goaledIds, setGoaledIds] = useState(new Set());
  const [selectedIds, setSelectedIds] = useState([]);
  const [existingGoal, setExistingGoal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open || !entry?.project_id) return;
    setLoading(true);
    setSaved(false);

    Promise.all([
      base44.entities.Task.filter({ project_id: entry.project_id }),
      base44.entities.DailyGoal.filter({ schedule_entry_id: entry.id }),
      base44.entities.DailyGoal.filter({ project_id: entry.project_id }),
    ]).then(([taskList, goals, projectGoals]) => {
      // Task ids already claimed by a daily goal on some OTHER schedule slot (another person/day),
      // so the setter can tell at a glance what is still unspoken for.
      const goaled = new Set();
      (projectGoals || []).forEach(g => {
        if (g.schedule_entry_id === entry.id) return;
        (g.task_ids || []).forEach(id => goaled.add(id));
      });
      setGoaledIds(goaled);
      const projectPhase = project?.phase;
      const currentPhaseIdx = projectPhase ? PHASES.indexOf(projectPhase) : PHASES.length - 1;

      // Filter by phase first
      const phasedTasks = taskList.filter(t => {
        if (!t.phase) return true;
        return PHASES.indexOf(t.phase) <= currentPhaseIdx;
      });

      const selectable = buildSelectableItems(phasedTasks);
      setItems(selectable);
      setTasks(phasedTasks);

      if (goals && goals.length > 0) {
        setExistingGoal(goals[0]);
        setSelectedIds(goals[0].task_ids || []);
      } else {
        setExistingGoal(null);
        setSelectedIds([]);
      }
      setLoading(false);
    });
  }, [open, entry?.id, userName]);

  const toggleItem = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    const selectedItems = items.filter(i => selectedIds.includes(i.id));
    const goalData = {
      schedule_entry_id: entry.id,
      user_id: entry.user_id,
      user_name: userName,
      project_id: entry.project_id,
      project_name: project?.name || '',
      scheduled_date: entry.scheduled_date,
      task_ids: selectedIds,
      task_titles: selectedItems.map(i => i.isSubtask ? `${i.sublabel} › ${i.label}` : i.label),
      set_by: [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.full_name || 'Admin',
    };

    if (existingGoal) {
      await base44.entities.DailyGoal.update(existingGoal.id, goalData);
    } else {
      await base44.entities.DailyGoal.create(goalData);
    }

    // Actively assign the selected work to this person and mark the task active. A task can need
    // more than one person, so we only fill an empty assignee, never overwrite an existing one.
    try {
      for (const it of selectedItems) {
        const task = tasks.find(t => t.id === it.taskId);
        if (!task) continue;
        const nextStatus = task.status === 'pending' ? 'in_progress' : task.status;
        if (it.isSubtask) {
          const newSubs = (task.subtasks || []).map(st =>
            st.id === it.subtaskId ? { ...st, assigned_to: st.assigned_to || userName } : st
          );
          await base44.entities.Task.update(task.id, { subtasks: newSubs, status: nextStatus });
        } else {
          await base44.entities.Task.update(task.id, { assigned_to: task.assigned_to || userName, status: nextStatus });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['all-tasks'] });
    } catch (e) {
      // Goal is saved; assignment is best-effort.
      console.error('Daily goal task assignment failed:', e);
    }

    if (selectedIds.length > 0) {
      await base44.entities.Notification.create({
        user_id: entry.user_id,
        type: 'task_assigned',
        title: '📋 Daily Goal Set',
        message: `${goalData.set_by} set ${selectedIds.length} item${selectedIds.length > 1 ? 's' : ''} as your goal for ${format(new Date(entry.scheduled_date + 'T12:00:00'), 'MMM d')} on ${project?.name || 'your project'}.`,
        project_id: entry.project_id,
        project_name: project?.name || '',
        read: false,
      });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => onOpenChange(false), 800);
  };

  const dateLabel = entry?.scheduled_date
    ? format(new Date(entry.scheduled_date + 'T12:00:00'), 'EEEE, MMM d')
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-5 h-5 text-accent" />
            Set Daily Goal
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-3">
          <span className="font-medium text-foreground">{userName}</span>
          {' · '}
          <span className="font-medium text-accent">{project?.name}</span>
          {' · '}
          {dateLabel}
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No active tasks on this project yet. Add tasks to the project first.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
            {items.map(item => (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedIds.includes(item.id)
                    ? 'border-accent bg-accent/5'
                    : (item.assignedTo || goaledIds.has(item.id))
                      ? 'border-border bg-muted/40 hover:bg-muted/60'
                      : 'border-border hover:bg-muted/50'
                }`}
              >
                <Checkbox
                  checked={selectedIds.includes(item.id)}
                  onCheckedChange={() => toggleItem(item.id)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    {item.isSubtask && <ListChecks className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                    <p className="text-sm font-medium leading-tight">{item.label}</p>
                  </div>
                  {item.sublabel && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {item.isSubtask ? `Task: ${item.sublabel}` : item.sublabel}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[item.priority] || 'bg-slate-100 text-slate-600'}`}>
                      {item.priority}
                    </Badge>
                    {item.phase && (
                      <Badge className={`text-[10px] px-1.5 py-0 flex items-center gap-0.5 ${PHASE_COLORS[item.phase] || 'bg-slate-100 text-slate-600'}`}>
                        <Layers className="w-2.5 h-2.5" />{item.phase.replace('phase_', 'Phase ')}
                      </Badge>
                    )}
                    {item.isSubtask && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-indigo-100 text-indigo-700">Subtask</Badge>
                    )}
                    {item.assignedTo && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-700">Assigned: {item.assignedTo}</Badge>
                    )}
                    {goaledIds.has(item.id) && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700">On a goal</Badge>
                    )}
                    {item.status === 'in_progress' && (
                      <Badge className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700">In Progress</Badge>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        <div className="pt-3 border-t flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {selectedIds.length} item{selectedIds.length !== 1 ? 's' : ''} selected
          </span>
          {saved ? (
            <div className="flex items-center gap-1.5 text-green-600 text-sm font-medium">
              <CheckCircle2 className="w-4 h-4" /> Saved!
            </div>
          ) : (
            <Button
              onClick={handleSave}
              disabled={saving || items.length === 0}
              className="bg-accent text-accent-foreground hover:bg-accent/90"
              size="sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              {existingGoal ? 'Update Goal' : 'Set Goal'}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}