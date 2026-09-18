import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { format } from 'date-fns';
import { Target, CheckSquare, User, FolderKanban, CheckCircle2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';

const priorityConfig = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Med', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
};

export default function DailyGoals() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: todayGoals = [], isLoading } = useQuery({
    queryKey: ['daily-goals-today', currentUser?.id],
    queryFn: () => base44.entities.DailyGoal.filter({ user_id: currentUser.id, scheduled_date: todayStr }),
    enabled: !!currentUser?.id,
  });

  const allTaskIds = todayGoals.flatMap(g => g.task_ids || []);

  const { data: allTasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    enabled: allTaskIds.length > 0,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]));
  const taskMap = Object.fromEntries(allTasks.map(t => [t.id, t]));

  // Build a flat list of goal tasks with project context
  const goalTasks = todayGoals.flatMap(goal =>
    (goal.task_ids || []).map(tid => ({
      task: taskMap[tid],
      project: projectMap[goal.project_id],
      goalStatus: goal.status,
    }))
  ).filter(g => g.task);

  // Name variants for subtask filtering
  const userNameVariants = new Set([
    currentUser?.full_name,
    currentUser?.email,
    [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' '),
  ].filter(Boolean));
  const isAssignedToMe = (name) => name && userNameVariants.has(name);
  const isCrewMember = currentUser?.role === 'crew_member';

  const toggleTask = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await base44.entities.Task.update(task.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['daily-goals-today', currentUser?.id] });
  };

  const toggleSubtask = async (task, subtaskId) => {
    const updated = (task.subtasks || []).map(s =>
      s.id === subtaskId ? { ...s, completed: !s.completed } : s
    );
    await base44.entities.Task.update(task.id, { subtasks: updated });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const completedCount = goalTasks.filter(g => g.task.status === 'completed').length;
  const totalCount = goalTasks.length;

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
          <Target className="w-7 h-7 text-amber-500" /> Today's Goals
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {format(new Date(), 'EEEE, MMMM d')} · Your daily assigned tasks
        </p>
      </div>

      {/* Progress */}
      {totalCount > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-foreground">{completedCount} of {totalCount} completed</span>
            {completedCount === totalCount && (
              <span className="flex items-center gap-1 text-green-600 text-sm font-semibold">
                <CheckCircle2 className="w-4 h-4" /> All done!
              </span>
            )}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-400 rounded-full transition-all"
              style={{ width: totalCount > 0 ? `${(completedCount / totalCount) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-amber-400 rounded-full animate-spin" />
        </div>
      ) : goalTasks.length === 0 ? (
        <div className="text-center py-20">
          <Target className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm font-medium text-foreground">No daily goals set for today</p>
          <p className="text-xs text-muted-foreground mt-1">Your site manager will assign daily goals on your schedule.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {goalTasks.map(({ task, project, goalStatus }) => {
            const pc = priorityConfig[task.priority] || priorityConfig.medium;
            const isCompleted = task.status === 'completed';
            const mySubtasks = isCrewMember
              ? (task.subtasks || []).filter(s => isAssignedToMe(s.assigned_to))
              : (task.subtasks || []);
            const completedSubtasks = mySubtasks.filter(s => s.completed).length;

            return (
              <Card key={task.id} className={`border ${isCompleted ? 'opacity-70 border-border' : 'border-amber-300 shadow-amber-100 shadow-sm'}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isCompleted}
                      onCheckedChange={() => toggleTask(task)}
                      className="shrink-0 mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${isCompleted ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {task.title}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
                        {project && (
                          <span className="flex items-center gap-1 font-medium text-foreground/70">
                            <FolderKanban className="w-3 h-3" /> {project.name}
                          </span>
                        )}
                        {task.assigned_to && (
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" /> {task.assigned_to}
                          </span>
                        )}
                        {mySubtasks.length > 0 && (
                          <span className="flex items-center gap-1 text-blue-600">
                            <CheckSquare className="w-3 h-3" /> {completedSubtasks}/{mySubtasks.length}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className={`${pc.className} text-xs shrink-0`}>{pc.label}</Badge>
                  </div>

                  {/* Subtasks */}
                  {mySubtasks.length > 0 && (
                    <div className="mt-3 ml-7 space-y-1.5 border-t pt-2">
                      {mySubtasks.map(s => {
                        const mine = isAssignedToMe(s.assigned_to);
                        return (
                          <div key={s.id} className={`flex items-center gap-2 rounded px-1 py-0.5 ${mine ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                            <Checkbox
                              checked={s.completed}
                              onCheckedChange={() => toggleSubtask(task, s.id)}
                              className="shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs ${s.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{s.title}</span>
                              {s.assigned_to && (
                                <span className="block text-[10px] text-muted-foreground mt-0.5">
                                  <User className="w-2.5 h-2.5 inline mr-0.5" />{s.assigned_to}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}