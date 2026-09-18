import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Trash2, ClipboardList, GripVertical, Pencil, ChevronDown, ChevronRight, Layers } from 'lucide-react';

const priorityConfig = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-blue-100 text-blue-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

export default function Templates() {
  const queryClient = useQueryClient();
  const [editTemplate, setEditTemplate] = useState(null); // null = closed, {} = new, {id,...} = edit
  const [form, setForm] = useState({ name: '', description: '', tasks: [] });
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newSubtaskInputs, setNewSubtaskInputs] = useState({}); // { taskIdx: string }
  const [expandedTasks, setExpandedTasks] = useState({});
  const [saving, setSaving] = useState(false);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.TaskTemplate.list('-created_date'),
  });

  const PHASE_OPTIONS = [
    { value: 'none', label: 'No phase (general)' },
    { value: 'phase_1', label: 'Phase 1' },
    { value: 'phase_2', label: 'Phase 2' },
    { value: 'phase_3', label: 'Phase 3' },
    { value: 'phase_4', label: 'Phase 4' },
    { value: 'phase_5', label: 'Phase 5' },
    { value: 'phase_6', label: 'Phase 6' },
  ];
  const phaseColors = {
    phase_1: 'bg-violet-100 text-violet-700', phase_2: 'bg-blue-100 text-blue-700',
    phase_3: 'bg-cyan-100 text-cyan-700', phase_4: 'bg-amber-100 text-amber-700',
    phase_5: 'bg-orange-100 text-orange-700', phase_6: 'bg-emerald-100 text-emerald-700',
  };

  const openNew = () => {
    setForm({ name: '', description: '', phase: '', tasks: [] });
    setEditTemplate({});
  };

  const openEdit = (template) => {
    setForm({ name: template.name, description: template.description || '', phase: template.phase || '', tasks: template.tasks || [] });
    setEditTemplate(template);
  };

  const closeDialog = () => {
    setEditTemplate(null);
    setNewTaskTitle('');
    setNewTaskPriority('medium');
  };

  const addTaskToForm = () => {
    if (!newTaskTitle.trim()) return;
    setForm(prev => ({
      ...prev,
      tasks: [...prev.tasks, { title: newTaskTitle.trim(), priority: newTaskPriority, notes: '', subtasks: [] }],
    }));
    setNewTaskTitle('');
    setNewTaskPriority('medium');
  };

  const removeTaskFromForm = (idx) => {
    setForm(prev => ({ ...prev, tasks: prev.tasks.filter((_, i) => i !== idx) }));
  };

  const [newSubtaskAssigneeInputs, setNewSubtaskAssigneeInputs] = useState({}); // { taskIdx: string }

  const addSubtask = (taskIdx) => {
    const val = (newSubtaskInputs[taskIdx] || '').trim();
    if (!val) return;
    const assignee = (newSubtaskAssigneeInputs[taskIdx] || '').trim();
    setForm(prev => ({
      ...prev,
      tasks: prev.tasks.map((t, i) => i === taskIdx
        ? { ...t, subtasks: [...(t.subtasks || []), { id: Date.now().toString(), title: val, assigned_to: assignee, completed: false }] }
        : t
      ),
    }));
    setNewSubtaskInputs(prev => ({ ...prev, [taskIdx]: '' }));
    setNewSubtaskAssigneeInputs(prev => ({ ...prev, [taskIdx]: '' }));
  };

  const removeSubtask = (taskIdx, subtaskIdx) => {
    setForm(prev => ({
      ...prev,
      tasks: prev.tasks.map((t, i) => i === taskIdx
        ? { ...t, subtasks: (t.subtasks || []).filter((_, si) => si !== subtaskIdx) }
        : t
      ),
    }));
  };

  const toggleTaskExpanded = (idx) => setExpandedTasks(prev => ({ ...prev, [idx]: !prev[idx] }));

  const handleSave = async () => {
    setSaving(true);
    if (editTemplate?.id) {
      await base44.entities.TaskTemplate.update(editTemplate.id, form);
    } else {
      await base44.entities.TaskTemplate.create(form);
    }
    queryClient.invalidateQueries({ queryKey: ['templates'] });
    setSaving(false);
    closeDialog();
  };

  const deleteTemplate = async (id) => {
    if (!confirm('Delete this template?')) return;
    await base44.entities.TaskTemplate.delete(id);
    queryClient.invalidateQueries({ queryKey: ['templates'] });
  };

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Task Templates</h1>
          <p className="text-sm text-muted-foreground mt-1">Reusable task checklists for new or existing projects</p>
        </div>
        <Button onClick={openNew} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Template
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : templates.length === 0 ? (
        <div className="text-center py-20">
          <ClipboardList className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold">No templates yet</h3>
          <p className="text-sm text-muted-foreground mt-1">Create reusable task checklists to apply to any project</p>
          <Button onClick={openNew} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
            <Plus className="w-4 h-4 mr-2" /> Create Template
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(template => (
            <Card key={template.id} className="border border-border">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base font-semibold">{template.name}</CardTitle>
                    {template.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{template.description}</p>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button onClick={() => openEdit(template)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => deleteTemplate(template.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-md hover:bg-muted transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs">{template.tasks?.length || 0} tasks</Badge>
                  {template.phase && (
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${phaseColors[template.phase] || ''}`}>
                      <Layers className="w-3 h-3" />
                      {PHASE_OPTIONS.find(p => p.value === template.phase)?.label}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5">
                  {(template.tasks || []).map((task, i) => (
                    <li key={i} className="space-y-0.5">
                      <div className="flex items-center gap-2 text-sm">
                        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                        <span className="flex-1 truncate">{task.title}</span>
                        {task.subtasks?.length > 0 && (
                          <span className="text-xs text-muted-foreground shrink-0">{task.subtasks.length} sub</span>
                        )}
                        <Badge variant="outline" className={`${priorityConfig[task.priority]} text-xs shrink-0`}>
                          {task.priority}
                        </Badge>
                      </div>
                      {task.subtasks?.some(s => s.assigned_to) && (
                        <div className="pl-6 space-y-0.5">
                          {task.subtasks.filter(s => s.assigned_to).map((s, si) => (
                            <div key={si} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground/40 shrink-0" />
                              <span className="truncate">{s.title}</span>
                              <span className="text-muted-foreground/60">→ {s.assigned_to}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={!!editTemplate} onOpenChange={open => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTemplate?.id ? 'Edit Template' : 'New Template'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Template Name *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Kitchen Remodel Checklist" />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Short description" />
            </div>
            <div>
              <Label className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Phase Association</Label>
              <Select value={form.phase || 'none'} onValueChange={val => setForm({ ...form, phase: val === 'none' ? '' : val })}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="No phase (general)" /></SelectTrigger>
                <SelectContent>
                  {PHASE_OPTIONS.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Phase-tagged templates are auto-imported for all 6 phases when a new project is created. When a phase is approved, template tasks for the next phase are also added automatically.</p>
            </div>

            <div>
              <Label className="mb-2 block">Tasks ({form.tasks.length})</Label>
              <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
                {form.tasks.map((task, i) => (
                  <div key={i} className="rounded-lg bg-muted/50 border border-border overflow-hidden">
                    <div className="flex items-center gap-2 p-2">
                      <button onClick={() => toggleTaskExpanded(i)} className="text-muted-foreground hover:text-foreground shrink-0">
                        {expandedTasks[i] ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                      <span className="flex-1 text-sm truncate">{task.title}</span>
                      {(task.subtasks?.length > 0) && (
                        <span className="text-xs text-muted-foreground shrink-0">{task.subtasks.length} subtask{task.subtasks.length !== 1 ? 's' : ''}</span>
                      )}
                      <Badge variant="outline" className={`${priorityConfig[task.priority]} text-xs shrink-0`}>{task.priority}</Badge>
                      <button onClick={() => removeTaskFromForm(i)} className="text-muted-foreground hover:text-destructive shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {expandedTasks[i] && (
                      <div className="px-3 pb-2 border-t border-border/50 bg-background/50">
                        <div className="space-y-1.5 mt-2">
                          {(task.subtasks || []).map((st, si) => (
                            <div key={si} className="rounded bg-muted/60 p-1.5 space-y-1">
                              <div className="flex items-center gap-2 text-xs">
                                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                                <span className="flex-1 font-medium">{st.title}</span>
                                <button onClick={() => removeSubtask(i, si)} className="hover:text-destructive text-muted-foreground">
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                              <div className="flex items-center gap-1 pl-3.5">
                                <Input
                                  value={st.assigned_to || ''}
                                  onChange={e => {
                                    setForm(prev => ({
                                      ...prev,
                                      tasks: prev.tasks.map((t, ti) => ti === i
                                        ? { ...t, subtasks: (t.subtasks || []).map((s, sj) => sj === si ? { ...s, assigned_to: e.target.value } : s) }
                                        : t
                                      ),
                                    }));
                                  }}
                                  placeholder="Assignee (optional)"
                                  className="h-6 text-[11px]"
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1.5 mt-2">
                          <Input
                            value={newSubtaskInputs[i] || ''}
                            onChange={e => setNewSubtaskInputs(prev => ({ ...prev, [i]: e.target.value }))}
                            onKeyDown={e => e.key === 'Enter' && addSubtask(i)}
                            placeholder="Subtask title..."
                            className="h-7 text-xs flex-1"
                          />
                          <Input
                            value={newSubtaskAssigneeInputs[i] || ''}
                            onChange={e => setNewSubtaskAssigneeInputs(prev => ({ ...prev, [i]: e.target.value }))}
                            placeholder="Assignee"
                            className="h-7 text-xs w-28"
                          />
                          <Button size="sm" variant="outline" onClick={() => addSubtask(i)} className="h-7 px-2">
                            <Plus className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                {form.tasks.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No tasks added yet</p>
                )}
              </div>

              {/* Add task inline */}
              <div className="flex gap-2">
                <Input
                  value={newTaskTitle}
                  onChange={e => setNewTaskTitle(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addTaskToForm()}
                  placeholder="Add a task..."
                  className="flex-1 h-8 text-sm"
                />
                <Select value={newTaskPriority} onValueChange={setNewTaskPriority}>
                  <SelectTrigger className="w-24 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Med</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={addTaskToForm} className="h-8 px-2">
                  <Plus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={!form.name || saving}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {saving ? 'Saving...' : editTemplate?.id ? 'Update Template' : 'Create Template'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}