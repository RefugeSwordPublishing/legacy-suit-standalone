import { useState, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { useQuery } from '@tanstack/react-query';
import { canManageTasks, canCompleteTasks, canAssignTasks, canEditTasks, canFixIt, canAddMaterials } from '@/lib/permissions';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, ListTodo, Trash2, User, FileText, AlertTriangle, Pencil, Package, ChevronDown, ChevronRight, CheckSquare, Wrench, ImageIcon, Lock, HardHat, Calendar } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import FixItDialog from './FixItDialog';
import TaskPhotoUpload from '@/components/tasks/TaskPhotoUpload';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import ApplyTemplateDialog from './ApplyTemplateDialog';

const priorityConfig = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Med', className: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
};

const emptyTask = { title: '', assigned_to: '', priority: 'medium', due_date: '', notes: '', photo_urls: [] };
const emptyMaterial = { name: '', quantity: '', unit: '', notes: '' };

const PHASES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'];
const PHASE_LABELS = {
  phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3',
  phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6',
};
const phaseColors = {
  phase_1: 'bg-violet-100 text-violet-700',
  phase_2: 'bg-blue-100 text-blue-700',
  phase_3: 'bg-cyan-100 text-cyan-700',
  phase_4: 'bg-amber-100 text-amber-700',
  phase_5: 'bg-orange-100 text-orange-700',
  phase_6: 'bg-emerald-100 text-emerald-700',
};

export default function TasksList({ tasks, projectId, projectName, project, onRefresh }) {
  const { currentUser } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [fixItOpen, setFixItOpen] = useState(false);
  const [form, setForm] = useState(emptyTask);
  const [filterAssignee, setFilterAssignee] = useState('all');
  const [saving, setSaving] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [editForm, setEditForm] = useState(emptyTask);
  const [taskMaterials, setTaskMaterials] = useState([]);
  const [showTaskMaterials, setShowTaskMaterials] = useState(false);
  const [subtasks, setSubtasks] = useState([]); // array of { title, assigned_to }
  const [newSubtask, setNewSubtask] = useState('');
  const [newSubtaskAssignee, setNewSubtaskAssignee] = useState('');

  const canManage = canManageTasks(currentUser);
  const canComplete = canCompleteTasks(currentUser);
  const canAssign = canAssignTasks(currentUser);
  const canEdit = canEditTasks(currentUser);
  const userCanFixIt = canFixIt(currentUser);
  const userCanPhoto = canFixIt(currentUser);
  const canCheckSubtasks = currentUser?.role !== 'client';

  const isHighRole = ['owner', 'coo', 'admin'].includes(currentUser?.role);
  const isSiteManager = currentUser?.role === 'site_manager';
  const currentPhase = project?.phase || 'phase_1';
  const currentPhaseIdx = PHASES.indexOf(currentPhase);
  // Track expanded phases: default open = current phase only
  const [expandedPhases, setExpandedPhases] = useState(() => {
    const init = {};
    PHASES.forEach(ph => { init[ph] = ph === currentPhase; });
    return init;
  });
  const togglePhase = (ph) => setExpandedPhases(prev => ({ ...prev, [ph]: !prev[ph] }));

  // For the "Add Task" phase selector (high roles only)
  // 'all' means no phase, shows in every phase
  const [addPhase, setAddPhase] = useState(currentPhase);

  const [editSubtasks, setEditSubtasks] = useState([]);
  const [newEditSubtask, setNewEditSubtask] = useState('');

  const openEdit = (task) => {
    setEditingTask(task);
    setEditForm({ title: task.title, assigned_to: task.assigned_to || '', priority: task.priority, due_date: task.due_date || '', notes: task.notes || '', photo_urls: task.photo_urls || [] });
    setEditSubtasks((task.subtasks || []).map(s => ({ ...s })));
  };

  const handleEditSave = async () => {
    setSaving(true);
    try {
      await base44.entities.Task.update(editingTask.id, { ...editForm, subtasks: editSubtasks });
      setEditingTask(null);
      setEditSubtasks([]);
      setNewEditSubtask('');
      onRefresh();
    } catch (e) {
      alert(`Could not save task: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const { data: allUsers = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const nonClientUsers = allUsers.filter(u => u.role !== 'client');

  const handleSave = async () => {
    setSaving(true);
    try {
    const taskSubtasks = subtasks.map((s, i) => ({ id: String(i), title: s.title, assigned_to: s.assigned_to || '', completed: false }));
    const targetPhase = isHighRole ? (addPhase === 'all' ? undefined : addPhase) : currentPhase;
    await base44.entities.Task.create({ ...form, project_id: projectId, status: 'pending', subtasks: taskSubtasks, photo_urls: form.photo_urls || [], phase: targetPhase });
    const validMaterials = taskMaterials.filter(m => m.name.trim());
    for (const mat of validMaterials) {
      await base44.entities.Material.create({
        project_id: projectId,
        name: mat.name,
        quantity: mat.quantity ? Number(mat.quantity) : undefined,
        unit: mat.unit,
        notes: mat.notes,
        priority: form.priority,
        status: 'needed',
      });
    }
    // Notify assigned user if they have task notifications enabled
    if (form.assigned_to) {
      const assignedProfile = allUsers.find(u => {
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.full_name || u.email;
        return fullName === form.assigned_to;
      });
      if (assignedProfile?.notify_task_assigned && assignedProfile.user_id) {
        await base44.entities.Notification.create({
          user_id: assignedProfile.user_id,
          type: 'task_assigned',
          title: '📋 Task Assigned to You',
          message: `"${form.title}" was assigned to you on ${projectName || 'a project'}.`,
          project_id: projectId,
          project_name: projectName,
          read: false,
        });
      }
    }
    setForm(emptyTask);
    setTaskMaterials([]);
    setSubtasks([]);
    setNewSubtask('');
    setNewSubtaskAssignee('');
    setShowTaskMaterials(false);
    setOpen(false);
    onRefresh();
    } catch (e) {
      alert(`Could not save task: ${e?.message || e}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task) => {
    if (!canComplete) return;
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    await base44.entities.Task.update(task.id, { status: newStatus });
    onRefresh();
  };

  const deleteTask = async (id) => {
    await base44.entities.Task.delete(id);
    onRefresh();
  };

  // Build per-phase task lists
  const getPhaseTasksFiltered = (ph) => {
    let phaseTasks = tasks.filter(t => t.phase === ph);
    if (filterAssignee !== 'all') phaseTasks = phaseTasks.filter(t => t.assigned_to === filterAssignee);
    return phaseTasks;
  };

  const unphasedTasks = tasks.filter(t => !t.phase && !t.is_sub_contractor_task);
  const allAssignees = [...new Set(tasks.map(t => t.assigned_to).filter(Boolean))];

  // Which phases are visible to this user
  const visiblePhases = isHighRole ? PHASES : PHASES.slice(0, currentPhaseIdx + 1);

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <ListTodo className="w-5 h-5 text-accent" />
            Tasks
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap">
            {userCanFixIt && (
              <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/5" onClick={() => setFixItOpen(true)}>
                <Wrench className="w-3.5 h-3.5 mr-1" /> Fix It
              </Button>
            )}
            {allAssignees.length > 0 && (
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Assignees</SelectItem>
                  {allAssignees.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {canManage && (
              <>
                <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setTemplateOpen(true)}>
                  <FileText className="w-3.5 h-3.5 mr-1" /> Template
                </Button>
                <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setTaskMaterials([]); setSubtasks([]); setNewSubtask(''); setShowTaskMaterials(false); setForm(emptyTask); } }}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-8 bg-accent text-accent-foreground hover:bg-accent/90">
                      <Plus className="w-3.5 h-3.5 mr-1" /> Add
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Add Task</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      {/* Phase picker for high roles */}
                      {isHighRole && (
                        <div>
                          <Label>Phase</Label>
                          <Select value={addPhase} onValueChange={setAddPhase}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="all">All Phases (always visible)</SelectItem>
                              {PHASES.map(ph => (
                                <SelectItem key={ph} value={ph}>
                                  {PHASE_LABELS[ph]}{ph === currentPhase ? ' (current)' : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <div>
                        <Label>Task *</Label>
                        <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="What needs to be done?" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        {canAssign && subtasks.length === 0 && (
                          <div>
                            <Label>Assign To</Label>
                            <Select value={form.assigned_to || 'unassigned'} onValueChange={val => setForm({ ...form, assigned_to: val === 'unassigned' ? '' : val })}>
                              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="unassigned">Unassigned</SelectItem>
                                {nonClientUsers.map(u => {
                                  const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                                  return <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>;
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
                      {subtasks.length > 0 && canAssign && (
                        <p className="text-xs text-muted-foreground -mt-1">Assignees are set per subtask when subtasks are present.</p>
                      )}
                      <div>
                        <Label>Due Date</Label>
                        <Input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Additional details" />
                      </div>
                      <div className="border rounded-lg p-3 space-y-2">
                        <p className="text-sm font-medium flex items-center gap-1.5"><CheckSquare className="w-4 h-4 text-muted-foreground" /> Checklist (optional)</p>
                        {subtasks.map((s, i) => (
                          <div key={i} className="space-y-1 bg-muted/50 rounded p-2">
                            <div className="flex items-center gap-2">
                              <span className="flex-1 text-sm font-medium">{s.title}</span>
                              <button onClick={() => setSubtasks(subtasks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            {canAssign && (
                              <Select
                                value={s.assigned_to || 'unassigned'}
                                onValueChange={val => setSubtasks(subtasks.map((st, j) => j === i ? { ...st, assigned_to: val === 'unassigned' ? '' : val } : st))}
                              >
                                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="unassigned">Unassigned</SelectItem>
                                  {nonClientUsers.map(u => {
                                    const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                                    return <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>;
                                  })}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <Input value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSubtask.trim()) { setSubtasks([...subtasks, { title: newSubtask.trim(), assigned_to: '' }]); setNewSubtask(''); e.preventDefault(); } }} placeholder="Add checklist item..." className="h-8 text-sm" />
                          <Button size="sm" variant="outline" className="h-8" onClick={() => { if (newSubtask.trim()) { setSubtasks([...subtasks, { title: newSubtask.trim(), assigned_to: '' }]); setNewSubtask(''); } }}>
                            <Plus className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-lg overflow-hidden">
                        <button className="w-full flex items-center justify-between p-3 text-sm font-medium hover:bg-muted/50 transition-colors" onClick={() => setShowTaskMaterials(!showTaskMaterials)}>
                          <span className="flex items-center gap-1.5"><Package className="w-4 h-4 text-muted-foreground" /> Materials needed? (optional)</span>
                          {showTaskMaterials ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        </button>
                        {showTaskMaterials && (
                          <div className="px-3 pb-3 space-y-2 border-t">
                            {taskMaterials.map((mat, i) => (
                              <div key={i} className="grid grid-cols-[1fr_60px_60px_auto] gap-1.5 items-center pt-2">
                                <Input value={mat.name} onChange={e => { const m = [...taskMaterials]; m[i].name = e.target.value; setTaskMaterials(m); }} placeholder="Material name" className="h-8 text-sm" />
                                <Input value={mat.quantity} onChange={e => { const m = [...taskMaterials]; m[i].quantity = e.target.value; setTaskMaterials(m); }} placeholder="Qty" className="h-8 text-sm" type="number" />
                                <Input value={mat.unit} onChange={e => { const m = [...taskMaterials]; m[i].unit = e.target.value; setTaskMaterials(m); }} placeholder="Unit" className="h-8 text-sm" />
                                <button onClick={() => setTaskMaterials(taskMaterials.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                            <Button size="sm" variant="outline" className="h-8 w-full mt-1 text-xs" onClick={() => setTaskMaterials([...taskMaterials, { ...emptyMaterial }])}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Add Material
                            </Button>
                          </div>
                        )}
                      </div>
                      {userCanPhoto && (
                        <div className="border rounded-lg p-3 space-y-2">
                          <p className="text-sm font-medium flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-muted-foreground" /> Photos (optional)</p>
                          <TaskPhotoUpload photoUrls={form.photo_urls || []} onChange={urls => setForm({ ...form, photo_urls: urls })} />
                        </div>
                      )}
                      <Button onClick={handleSave} disabled={!form.title || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                        {saving ? 'Saving...' : `Add Task${taskMaterials.filter(m=>m.name).length > 0 ? ` + ${taskMaterials.filter(m=>m.name).length} material${taskMaterials.filter(m=>m.name).length>1?'s':''}` : ''}`}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current & past phases, fully active */}
        {visiblePhases.map(ph => {
          const phaseTasks = getPhaseTasksFiltered(ph);
          const isCurrentPh = ph === currentPhase;
          const isFuture = PHASES.indexOf(ph) > currentPhaseIdx;

          if (!isHighRole && phaseTasks.length === 0) return null;

          const isExpanded = expandedPhases[ph] ?? isCurrentPh;
          return (
            <div key={ph}>
              {/* Phase header, clickable to expand/collapse */}
              <button
                onClick={() => togglePhase(ph)}
                className={`flex items-center gap-2 mb-2 w-full text-left hover:opacity-80 transition-opacity ${isFuture ? 'opacity-50' : ''}`}
              >
                <span className={`px-2 py-0.5 rounded text-xs font-semibold ${phaseColors[ph]}`}>{PHASE_LABELS[ph]}</span>
                {isCurrentPh && <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Current</span>}
                {isFuture && <Lock className="w-3 h-3 text-muted-foreground" />}
                {isFuture && <span className="text-[10px] text-muted-foreground">Management only</span>}
                <span className="text-xs text-muted-foreground ml-auto">{phaseTasks.length} task{phaseTasks.length !== 1 ? 's' : ''}</span>
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
              </button>

              {/* Ghost overlay for future phases */}
              {isExpanded && <div className={isFuture ? 'opacity-50 pointer-events-auto' : ''}>
                {phaseTasks.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2 pl-1">No tasks for this phase yet.</p>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {phaseTasks.filter(t => t.status !== 'completed').map(task => (
                        <TaskRow key={task.id} task={task} onToggle={isFuture ? () => {} : toggleComplete} onDelete={deleteTask} onEdit={openEdit} onRefresh={onRefresh} canManage={canManage} canComplete={!isFuture && canComplete} canEdit={canEdit} canCheckSubtasks={!isFuture && canCheckSubtasks} currentPhase={currentPhase} />
                      ))}
                    </AnimatePresence>
                    {phaseTasks.filter(t => t.status === 'completed').length > 0 && (
                      <div className="opacity-60 space-y-2">
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-2">Completed ({phaseTasks.filter(t => t.status === 'completed').length})</p>
                        {phaseTasks.filter(t => t.status === 'completed').map(task => (
                          <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={deleteTask} onEdit={openEdit} onRefresh={onRefresh} canManage={canManage} canComplete={canComplete} canEdit={canEdit} canCheckSubtasks={canCheckSubtasks} currentPhase={currentPhase} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>}

              {ph !== PHASES[PHASES.length - 1] && <div className="border-t border-border/50 mt-4" />}
            </div>
          );
        })}

        {/* Unphased tasks */}
        {unphasedTasks.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">General (no phase)</span>
            </div>
            <div className="space-y-2">
              {unphasedTasks.map(task => (
                <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={deleteTask} onEdit={openEdit} onRefresh={onRefresh} canManage={canManage} canComplete={canComplete} canEdit={canEdit} canCheckSubtasks={canCheckSubtasks} currentPhase={currentPhase} />
              ))}
            </div>
          </div>
        )}

        {/* Sub Contractor Work section */}
        {(() => {
          const subTasks = tasks.filter(t => t.is_sub_contractor_task);
          if (subTasks.length === 0) return null;
          return (
            <div>
              <div className="border-t border-border/50 mt-4 mb-4" />
              <div className="flex items-center gap-2 mb-2">
                <HardHat className="w-4 h-4 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sub Contractor Work</span>
                <span className="text-xs text-muted-foreground ml-auto">{subTasks.length} task{subTasks.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {subTasks.map(task => (
                    <TaskRow key={task.id} task={task} onToggle={toggleComplete} onDelete={deleteTask} onEdit={openEdit} onRefresh={onRefresh} canManage={canManage} canComplete={canComplete} canEdit={canEdit} canCheckSubtasks={canCheckSubtasks} currentPhase={currentPhase} isSubContractorTask />
                  ))}
                </AnimatePresence>
              </div>
            </div>
          );
        })()}

        {tasks.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No tasks yet.</p>
        )}
      </CardContent>

      {/* Edit Task Dialog */}
      <Dialog open={!!editingTask} onOpenChange={(o) => !o && setEditingTask(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <div className="space-y-3">
            <div>
              <Label>Task *</Label>
              <Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {canAssign && editSubtasks.length === 0 && (
                <div>
                  <Label>Assign To</Label>
                  <Select value={editForm.assigned_to || 'unassigned'} onValueChange={val => setEditForm({ ...editForm, assigned_to: val === 'unassigned' ? '' : val })}>
                    <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {nonClientUsers.map(u => {
                        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                        return <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Priority</Label>
                <Select value={editForm.priority} onValueChange={val => setEditForm({ ...editForm, priority: val })}>
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
            {editSubtasks.length > 0 && canAssign && (
              <p className="text-xs text-muted-foreground">Assignees are set per subtask when subtasks are present.</p>
            )}
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={editForm.due_date} onChange={e => setEditForm({ ...editForm, due_date: e.target.value })} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} placeholder="Additional details" />
            </div>
            <div className="border rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium flex items-center gap-1.5"><CheckSquare className="w-4 h-4 text-muted-foreground" /> Checklist</p>
              {editSubtasks.map((s, i) => (
                <div key={s.id || i} className="space-y-1 bg-muted/50 rounded p-2">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={s.completed}
                      disabled={!canCheckSubtasks}
                      onCheckedChange={() => setEditSubtasks(editSubtasks.map((st, j) => j === i ? { ...st, completed: !st.completed } : st))}
                    />
                    <span className={`text-sm flex-1 ${s.completed ? 'line-through text-muted-foreground' : ''}`}>{s.title}</span>
                    {canManage && (
                      <button onClick={() => setEditSubtasks(editSubtasks.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  {canAssign && (
                    <Select
                      value={s.assigned_to || 'unassigned'}
                      onValueChange={val => setEditSubtasks(editSubtasks.map((st, j) => j === i ? { ...st, assigned_to: val === 'unassigned' ? '' : val } : st))}
                    >
                      <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Unassigned</SelectItem>
                        {nonClientUsers.map(u => {
                          const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                          return <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
              {canManage && (
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newEditSubtask}
                    onChange={e => setNewEditSubtask(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newEditSubtask.trim()) { setEditSubtasks([...editSubtasks, { id: Date.now().toString(), title: newEditSubtask.trim(), completed: false, assigned_to: '' }]); setNewEditSubtask(''); e.preventDefault(); } }}
                    placeholder="Add checklist item..."
                    className="h-8 text-sm"
                  />
                  <Button size="sm" variant="outline" className="h-8" onClick={() => { if (newEditSubtask.trim()) { setEditSubtasks([...editSubtasks, { id: Date.now().toString(), title: newEditSubtask.trim(), completed: false, assigned_to: '' }]); setNewEditSubtask(''); } }}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                </div>
              )}
            </div>
            {userCanPhoto && (
              <div className="border rounded-lg p-3 space-y-2">
                <p className="text-sm font-medium flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-muted-foreground" /> Photos</p>
                <TaskPhotoUpload photoUrls={editForm.photo_urls || []} onChange={urls => setEditForm({ ...editForm, photo_urls: urls })} />
              </div>
            )}
            <Button onClick={handleEditSave} disabled={!editForm.title || saving} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ApplyTemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        projectId={projectId}
        onApplied={onRefresh}
      />

      <FixItDialog
        open={fixItOpen}
        onOpenChange={setFixItOpen}
        projectId={projectId}
        projectName={projectName}
        project={project}
        tasks={tasks}
        allUsers={allUsers}
        onRefresh={onRefresh}
      />
    </Card>
  );
}


function TaskRow({ task, onToggle, onDelete, onEdit, onRefresh, canManage, canComplete, canEdit, canCheckSubtasks, currentPhase, isSubContractorTask }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pc = priorityConfig[task.priority] || priorityConfig.medium;
  const isCompleted = task.status === 'completed';
  const subtasks = task.subtasks || [];
  const hasSubtasks = subtasks.length > 0;
  const isUnassigned = !hasSubtasks && (!task.assigned_to || task.assigned_to === 'unassigned');
  const completedSubtasks = subtasks.filter(s => s.completed).length;

  const toggleSubtask = async (subtaskId) => {
    const updated = subtasks.map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    await base44.entities.Task.update(task.id, { subtasks: updated });
    onRefresh();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`rounded-lg border transition-colors group ${isUnassigned && !isCompleted ? 'border-red-200 bg-red-50/30' : 'border-border'}`}
    >
      <div className="flex items-center gap-3 p-3 hover:bg-muted/50">
        <Checkbox
          checked={isCompleted}
          onCheckedChange={() => onToggle(task)}
          disabled={!canComplete}
          className="shrink-0"
        />
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium cursor-pointer ${titleExpanded ? 'whitespace-normal break-words' : 'truncate'} ${isCompleted ? 'line-through text-muted-foreground' : ''}`}
            onClick={() => setTitleExpanded(v => !v)}
          >
            {task.title}
          </p>
          <div className="flex items-center gap-2 text-xs mt-0.5 flex-wrap">
            {isUnassigned && !isCompleted ? (
              <span className="flex items-center gap-1 text-red-600 font-medium">
                <AlertTriangle className="w-3 h-3" /> Unassigned
              </span>
            ) : task.assigned_to ? (
              <span className="flex items-center gap-1 text-muted-foreground">
                <User className="w-3 h-3" />
                {task.assigned_to}
              </span>
            ) : null}
            {task.due_date && <span className="text-muted-foreground">· Due {format(new Date(task.due_date), 'MMM d')}</span>}
            {task.phase && task.phase !== currentPhase && (
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${phaseColors[task.phase] || ''}`}>{PHASE_LABELS[task.phase]}</span>
            )}
            {task.notes && (
              <span className="flex items-center gap-1 text-muted-foreground">
                · {task.notes}
              </span>
            )}
            {isSubContractorTask && task.sub_contractor_name && (
              <span className="flex items-center gap-1 text-amber-700 font-medium">
                <HardHat className="w-3 h-3" /> {task.sub_contractor_name}
              </span>
            )}
            {isSubContractorTask && task.eta_start && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Calendar className="w-3 h-3" />
                ETA: {format(new Date(task.eta_start), 'MMM d')}{task.eta_end ? ` - ${format(new Date(task.eta_end), 'MMM d')}` : ''}
              </span>
            )}
            {subtasks.length > 0 && (
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-0.5 text-blue-600 font-medium hover:underline">
                <CheckSquare className="w-3 h-3" /> {completedSubtasks}/{subtasks.length}
                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>
        <Badge variant="outline" className={`${pc.className} text-xs shrink-0`}>{pc.label}</Badge>
        {canEdit && (
          <button onClick={() => onEdit(task)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-all">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
        {canManage && (
          <button onClick={() => setConfirmDelete(true)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
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
        <div className="mx-3 mb-3 space-y-1.5 border-t pt-2">
          {subtasks.map(s => (
            <div key={s.id} className="flex items-center gap-2 ml-7">
              <Checkbox
                checked={s.completed}
                onCheckedChange={() => toggleSubtask(s.id)}
                disabled={!canCheckSubtasks}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <span className={`text-xs block ${s.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>{s.title}</span>
                {s.assigned_to && (
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                    <User className="w-2.5 h-2.5" />{s.assigned_to}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Photo thumbnails */}
      {task.photo_urls?.length > 0 && (
        <div className="mx-3 mb-3 flex flex-wrap gap-1.5 border-t pt-2">
          {task.photo_urls.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`task-photo-${i}`}
              className="w-12 h-12 rounded-md object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
              onClick={() => setLightbox(url)}
            />
          ))}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="full" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2" onClick={() => setLightbox(null)}>
            ✕
          </button>
        </div>
      )}
    </motion.div>
  );
}