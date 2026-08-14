import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { canManageTasks, canAssignTasks, canViewAllProjects, canEditTasks } from '@/lib/permissions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ListTodo, User, AlertTriangle, Plus, Trash2, Pencil, Package, ChevronDown, ChevronRight, CheckSquare, Target } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import { sortByName } from '@/lib/naturalSort';

const priorityConfig = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Med', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
};

const emptyTask = { title: '', assigned_to: '', priority: 'medium', due_date: '', notes: '', project_id: '' };
const emptyMaterial = { name: '', quantity: '', unit: '', notes: '' };

export default function Tasks() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  // Read ?view= from URL
  const urlParams = new URLSearchParams(window.location.search);
  const [viewFilter, setViewFilter] = useState(urlParams.get('view') === 'mine' ? 'mine' : 'all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyTask);
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [materials, setMaterials] = useState([]);
  const [showMaterials, setShowMaterials] = useState(false);
  const [subtasks, setSubtasks] = useState([]);
  const [newSubtask, setNewSubtask] = useState('');

  const isCrewMember = currentUser?.role === 'crew_member';
  const isSiteManager = currentUser?.role === 'site_manager';
  const isHighRole = currentUser?.role === 'owner' || currentUser?.role === 'coo' || currentUser?.role === 'admin';

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: todayGoals = [] } = useQuery({
    queryKey: ['daily-goals-today', currentUser?.id],
    queryFn: () => base44.entities.DailyGoal.filter({ user_id: currentUser.id, scheduled_date: todayStr }),
    enabled: !!currentUser?.id,
  });

  // Flat set of task IDs that are part of today's goals for this user
  const goalTaskIds = new Set(todayGoals.flatMap(g => g.task_ids || []));

  // Determine visible projects by role
  // Build all possible name variants for matching
  const userNameVariants = new Set([
    currentUser?.full_name,
    currentUser?.email,
    [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' '),
  ].filter(Boolean));

  const isAssignedToMe = (name) => name && userNameVariants.has(name);
  const hasMySubtask = (t) => (t.subtasks || []).some(st => isAssignedToMe(st.assigned_to));

  // For crew members: visible projects = any project they have a task/subtask in
  const crewTaskProjectIds = isCrewMember
    ? new Set(allTasks.filter(t => isAssignedToMe(t.assigned_to) || hasMySubtask(t)).map(t => t.project_id))
    : null;

  const visibleProjects = isHighRole
    ? allProjects
    : isCrewMember
      ? allProjects.filter(p => crewTaskProjectIds.has(p.id))
      : allProjects.filter(p => (currentUser?.assigned_project_ids || []).includes(p.id));

  const visibleProjectIds = new Set(visibleProjects.map(p => p.id));

  // Filter tasks by role
  // Crew members: show ALL tasks assigned to them across ALL projects (they may not be in assigned_project_ids)
  let tasks;
  if (isCrewMember) {
    tasks = allTasks.filter(t => isAssignedToMe(t.assigned_to) || hasMySubtask(t));
  } else {
    tasks = allTasks.filter(t => visibleProjectIds.has(t.project_id));
    if (viewFilter === 'mine') {
      tasks = tasks.filter(t => isAssignedToMe(t.assigned_to) || hasMySubtask(t));
    }
  }

  if (projectFilter !== 'all') {
    tasks = tasks.filter(t => t.project_id === projectFilter);
  }

  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]));

  // Cross-reference with active projects and phase-matching
  const activeProjectIds = new Set(allProjects.filter(p => p.status === 'active').map(p => p.id));
  tasks = tasks.filter(t => {
    if (!activeProjectIds.has(t.project_id)) return false;
    const proj = projectMap[t.project_id];
    if (proj?.phase) {
      // Project has a current phase, only show tasks for that phase
      return !t.phase || t.phase === proj.phase;
    }
    return true; // No phase set on project, show all tasks
  });

  const phaseOrder = [null, 'phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'];
  const pending = [...tasks.filter(t => t.status !== 'completed')].sort((a, b) => {
    const ai = phaseOrder.indexOf(a.phase || null);
    const bi = phaseOrder.indexOf(b.phase || null);
    return ai - bi;
  });
  const completed = tasks.filter(t => t.status === 'completed');

  const canManage = canManageTasks(currentUser);
  const canAssign = canAssignTasks(currentUser);
  const canEdit = canEditTasks(currentUser);
  const canCheckSubtasks = currentUser?.role !== 'client';

  const openEdit = (task) => {
    setEditingTask(task);
    setEditForm({ title: task.title, assigned_to: task.assigned_to || '', priority: task.priority, due_date: task.due_date || '', notes: task.notes || '' });
  };

  const handleEditSave = async () => {
    setSaving(true);
    await base44.entities.Task.update(editingTask.id, editForm);
    setEditingTask(null);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const toggleComplete = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await base44.entities.Task.update(task.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });

    // Check if any daily goal is now fully completed
    if (newStatus === 'completed' && todayGoals.length > 0) {
      const updatedTasks = await base44.entities.Task.filter({ project_id: task.project_id });
      for (const goal of todayGoals) {
        if (goal.status === 'completed') continue;
        const goalTasks = updatedTasks.filter(t => (goal.task_ids || []).includes(t.id));
        const allDone = goalTasks.length > 0 && goalTasks.every(t => t.status === 'completed' || t.id === task.id);
        if (allDone) {
          await base44.entities.DailyGoal.update(goal.id, { status: 'completed' });
          queryClient.invalidateQueries({ queryKey: ['daily-goals-today', currentUser?.id] });
          // Notify site managers
          const siteManagers = await base44.entities.UserProfile.filter({ role: 'site_manager' });
          for (const sm of siteManagers) {
            await base44.entities.Notification.create({
              user_id: sm.user_id,
              type: 'daily_goal',
              title: '🎯 Daily Goal Completed',
              message: `${goal.user_name} completed all their daily goal tasks for ${goal.project_name}.`,
              project_id: goal.project_id,
              project_name: goal.project_name,
              read: false,
            });
          }
        }
      }
    }
  };

  const [showCompleted, setShowCompleted] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const deleteTask = async (id) => {
    await base44.entities.Task.delete(id);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const handleSave = async () => {
    if (!form.title || !form.project_id) return;
    setSaving(true);
    const taskSubtasks = subtasks.map((s, i) => ({ id: String(i), title: s, completed: false }));
    await base44.entities.Task.create({ ...form, status: 'pending', subtasks: taskSubtasks });
    // Save any material requests
    const validMaterials = materials.filter(m => m.name.trim());
    for (const mat of validMaterials) {
      await base44.entities.Material.create({
        project_id: form.project_id,
        name: mat.name,
        quantity: mat.quantity ? Number(mat.quantity) : undefined,
        unit: mat.unit,
        notes: mat.notes,
        priority: form.priority,
        status: 'needed',
      });
    }
    setForm(emptyTask);
    setMaterials([]);
    setSubtasks([]);
    setNewSubtask('');
    setShowMaterials(false);
    setAddOpen(false);
    setSaving(false);
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['materials'] });
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Tasks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isCrewMember ? 'Your assigned tasks' : 'Manage and track tasks across projects'}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setAddOpen(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-2" /> Add Task
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        {(isHighRole || isSiteManager) && (
          <Select value={viewFilter} onValueChange={setViewFilter}>
            <SelectTrigger className="w-36 h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tasks</SelectItem>
              <SelectItem value="mine">My Tasks</SelectItem>
            </SelectContent>
          </Select>
        )}
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-48 h-9 text-sm">
            <SelectValue placeholder="All Projects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Projects</SelectItem>
            {sortByName(visibleProjects).map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="text-center py-20">
          <ListTodo className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No tasks found.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {pending.length > 0 && (
            <div className="space-y-2">
              {pending.map(task => (
                <TaskRow
                  key={task.id}
                  task={task}
                  project={projectMap[task.project_id]}
                  canManage={canManage}
                  canEdit={canEdit}
                  canCheckSubtasks={canCheckSubtasks}
                  onToggle={toggleComplete}
                  onDelete={deleteTask}
                  onEdit={openEdit}
                  queryClient={queryClient}
                  isGoalTask={goalTaskIds.has(task.id)}
                  isAssignedToMe={isAssignedToMe}
                  filterSubtasksToMe={isCrewMember}
                />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div>
              <button
                onClick={() => setShowCompleted(v => !v)}
                className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider hover:text-foreground transition-colors"
              >
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showCompleted ? '' : '-rotate-90'}`} />
                Completed ({completed.length})
              </button>
              {showCompleted && (
                <div className="space-y-2 opacity-60">
                  {completed.map(task => (
                    <TaskRow
                      key={task.id}
                      task={task}
                      project={projectMap[task.project_id]}
                      canManage={canManage}
                      canEdit={canEdit}
                      onToggle={toggleComplete}
                      onDelete={deleteTask}
                      onEdit={openEdit}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(o) => !o && setEditingTask(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Task</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Task *</Label>
              <Input value={editForm.title || ''} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {canAssign && (
                <div>
                  <Label>Assign To</Label>
                  <Select value={editForm.assigned_to || 'unassigned'} onValueChange={val => setEditForm({ ...editForm, assigned_to: val === 'unassigned' ? '' : val })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {allUsers.filter(u => u.role !== 'client').map(u => {
                                         const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                                         return (
                                         <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>
                                         );
                                       })}
                                       </SelectContent>
                                       </Select>
                                       </div>
                                       )}
                              <div>
                                 <Label>Priority</Label>
                      <Select value={editForm.priority || 'medium'} onValueChange={val => setEditForm({ ...editForm, priority: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      </SelectContent>
                      </Select>
                      </div>
                      </div>
                      <div>
                      <Label>Due Date</Label>
                      <Input type="date" value={editForm.due_date || ''} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} />
                      </div>
                      <div>
                      <Label>Notes</Label>
                      <Input value={editForm.notes || ''} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Additional details" />
                      </div>
                      {editingTask?.subtasks?.length > 0 && (
                        <div className="border rounded-lg p-3 space-y-2">
                          <p className="text-sm font-medium flex items-center gap-1.5"><CheckSquare className="w-4 h-4 text-muted-foreground" /> Checklist</p>
                          {editingTask.subtasks.map(s => (
                            <div key={s.id} className="flex items-center gap-2">
                              <Checkbox
                                checked={s.completed}
                                disabled={!canCheckSubtasks}
                                onCheckedChange={async () => {
                                  const updated = editingTask.subtasks.map(sub => sub.id === s.id ? { ...sub, completed: !sub.completed } : sub);
                                  await base44.entities.Task.update(editingTask.id, { subtasks: updated });
                                  setEditingTask({ ...editingTask, subtasks: updated });
                                  queryClient.invalidateQueries({ queryKey: ['tasks'] });
                                }}
                              />
                              <span className={`text-sm ${s.completed ? 'line-through text-muted-foreground' : ''}`}>{s.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <Button onClick={handleEditSave} disabled={!editForm.title || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      {saving ? 'Saving...' : 'Save Changes'}
                      </Button>
                      </div>
                      </DialogContent>
                      </Dialog>

                      {/* Add Task Dialog */}
                      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) { setMaterials([]); setSubtasks([]); setNewSubtask(''); setShowMaterials(false); setForm(emptyTask); } }}>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                      <DialogTitle>Add Task</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-3">
                      <div>
                      <Label>Project *</Label>
                      <Select value={form.project_id} onValueChange={val => setForm({ ...form, project_id: val })}>
                      <SelectTrigger><SelectValue placeholder="Select project..." /></SelectTrigger>
                      <SelectContent>
                      {visibleProjects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                      </SelectContent>
                      </Select>
                      </div>
                      <div>
                      <Label>Task *</Label>
                      <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {canAssign && (
                      <div>
                      <Label>Assign To</Label>
                      <Select value={form.assigned_to} onValueChange={val => setForm({ ...form, assigned_to: val })}>
                      <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {allUsers.filter(u => u.role !== 'client').map(u => {
                        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                        return (
                        <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>
                        );
                      })}
                      </SelectContent>
                      </Select>
                      </div>
                      )}
                      <div>
                      <Label>Priority</Label>
                <Select value={form.priority} onValueChange={val => setForm({ ...form, priority: val })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional details" />
            </div>

            {/* Subtasks / Checklist */}
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><CheckSquare className="w-4 h-4 text-muted-foreground" /> Checklist (optional)</p>
              {subtasks.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="flex-1 text-sm text-muted-foreground bg-muted rounded px-2 py-1">{s}</span>
                  <button onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2">
                <Input
                  value={newSubtask}
                  onChange={e => setNewSubtask(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { setSubtasks([...subtasks, newSubtask.trim()]); setNewSubtask(''); e.preventDefault(); } }}
                  placeholder="Add checklist item..."
                  className="h-8 text-sm"
                />
                <Button size="sm" variant="outline" className="h-8" onClick={() => { if (newSubtask.trim()) { setSubtasks([...subtasks, newSubtask.trim()]); setNewSubtask(''); } }}>
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Material Request */}
            <div className="border rounded-lg overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors"
                onClick={() => setShowMaterials(!showMaterials)}
              >
                <span className="flex items-center gap-1.5"><Package className="w-4 h-4 text-muted-foreground" /> Materials needed for this task? (optional)</span>
                {showMaterials ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              {showMaterials && (
                <div className="px-3 pb-3 space-y-2 border-t">
                  {materials.map((mat, i) => (
                    <div key={i} className="grid grid-cols-[1fr_60px_60px_auto] gap-1.5 items-center pt-2">
                      <Input value={mat.name} onChange={e => { const m = [...materials]; m[i].name = e.target.value; setMaterials(m); }} placeholder="Material name" className="h-8 text-sm" />
                      <Input value={mat.quantity} onChange={e => { const m = [...materials]; m[i].quantity = e.target.value; setMaterials(m); }} placeholder="Qty" className="h-8 text-sm" type="number" />
                      <Input value={mat.unit} onChange={e => { const m = [...materials]; m[i].unit = e.target.value; setMaterials(m); }} placeholder="Unit" className="h-8 text-sm" />
                      <button onClick={() => setMaterials(materials.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-8 w-full mt-1 text-xs" onClick={() => setMaterials([...materials, { ...emptyMaterial }])}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Add Material
                  </Button>
                </div>
              )}
            </div>

            <Button onClick={handleSave} disabled={!form.title || !form.project_id || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Saving...' : `Add Task${materials.filter(m=>m.name).length > 0 ? ` + ${materials.filter(m=>m.name).length} material${materials.filter(m=>m.name).length>1?'s':''}` : ''}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TaskRow({ task, project, canManage, canEdit, canCheckSubtasks, onToggle, onDelete, onEdit, queryClient, isGoalTask, isAssignedToMe, filterSubtasksToMe }) {
  const allSubtasks = task.subtasks || [];
  // For crew members, only show subtasks assigned to them
  const subtasks = filterSubtasksToMe && isAssignedToMe
    ? allSubtasks.filter(s => isAssignedToMe(s.assigned_to))
    : allSubtasks;
  // Auto-expand if user is shown because of a subtask assignment (not direct task assignment)
  const hasMySubtask = isAssignedToMe && subtasks.some(st => isAssignedToMe(st.assigned_to));
  const directlyAssigned = isAssignedToMe && isAssignedToMe(task.assigned_to);
  const autoExpand = hasMySubtask && !directlyAssigned;

  const [expanded, setExpanded] = useState(autoExpand);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pc = priorityConfig[task.priority] || priorityConfig.medium;
  const isCompleted = task.status === 'completed';
  const isUnassigned = !task.assigned_to || task.assigned_to === 'unassigned';
  const completedSubtasks = subtasks.filter(s => s.completed).length;

  const toggleSubtask = async (subtaskId) => {
    const updated = subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    await base44.entities.Task.update(task.id, { subtasks: updated });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  return (
    <Card className={`border ${isGoalTask && !isCompleted ? 'border-amber-400 shadow-amber-100 shadow-md' : isUnassigned && !isCompleted ? 'border-red-200' : 'border-border'}`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isCompleted}
            onCheckedChange={() => onToggle(task)}
            className="shrink-0 mt-0.5"
          />
          <div className="flex-1 min-w-0">
            <p
              className={`text-sm font-medium cursor-pointer ${titleExpanded ? 'whitespace-normal break-words' : ''} ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
              onClick={() => setTitleExpanded(v => !v)}
            >
              {isGoalTask && !isCompleted && (
                <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold mr-1.5 bg-amber-50 px-1.5 py-0.5 rounded">
                  <Target className="w-3 h-3" /> Goal
                </span>
              )}
              {task.title}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-1">
              {project && <span className="font-medium text-foreground/70">{project.name}</span>}
              {isUnassigned && !isCompleted ? (
                <span className="flex items-center gap-1 text-red-600 font-medium">
                  <AlertTriangle className="w-3 h-3" /> Unassigned
                </span>
              ) : task.assigned_to && task.assigned_to !== 'unassigned' ? (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" /> {task.assigned_to}
                </span>
              ) : null}
              {task.due_date && <span>Due {format(new Date(task.due_date), 'MMM d')}</span>}
              {subtasks.length > 0 && (
                <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1 text-blue-600 font-medium hover:underline">
                  <CheckSquare className="w-3 h-3" /> {completedSubtasks}/{subtasks.length}
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge variant="outline" className={`${pc.className} text-xs`}>{pc.label}</Badge>
            {canEdit && (
              <button onClick={() => onEdit(task)} className="text-muted-foreground hover:text-foreground transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
            {canManage && (
              <button onClick={() => setConfirmDelete(true)} className="text-muted-foreground hover:text-destructive transition-colors">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete task?</AlertDialogTitle>
              <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(task.id)}>Delete</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {expanded && subtasks.length > 0 && (
          <div className="mt-2 ml-7 space-y-1.5 border-t pt-2">
            {subtasks.map(s => {
              const isMine = isAssignedToMe && isAssignedToMe(s.assigned_to);
              return (
                <div key={s.id} className={`flex items-center gap-2 rounded px-1 ${isMine ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <Checkbox
                    checked={s.completed}
                    onCheckedChange={() => toggleSubtask(s.id)}
                    disabled={!canCheckSubtasks}
                    className="shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className={`text-xs ${s.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{s.title}</span>
                    {s.assigned_to && (
                      <span className="block text-[10px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                        <User className="w-2.5 h-2.5 inline" /> {s.assigned_to}
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
}