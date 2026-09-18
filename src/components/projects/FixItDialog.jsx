import { useState, useRef, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Camera, Upload, ArrowRight, Circle, Minus, RotateCcw, Check, Wrench } from 'lucide-react';
import { taskAssignees } from '@/lib/taskAssignees';
import AssigneeSelect from '@/components/tasks/AssigneeSelect';

const TOOLS = [
  { id: 'arrow', label: 'Arrow', icon: ArrowRight },
  { id: 'circle', label: 'Circle', icon: Circle },
  { id: 'line', label: 'Line', icon: Minus },
];

const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#ffffff'];

export default function FixItDialog({ open, onOpenChange, projectId, projectName, project, tasks, allUsers, onRefresh }) {
  const [step, setStep] = useState(1); // 1=photo, 2=annotate, 3=task
  const [photo, setPhoto] = useState(null); // base64 or file
  const [photoFile, setPhotoFile] = useState(null);
  const [tool, setTool] = useState('arrow');
  const [color, setColor] = useState('#ef4444');
  const [annotations, setAnnotations] = useState([]);
  const [drawing, setDrawing] = useState(null);
  const [taskMode, setTaskMode] = useState('new'); // 'new' | 'existing'
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [assignees, setAssignees] = useState([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [annotatedImageUrl, setAnnotatedImageUrl] = useState(null);

  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const fileRef = useRef(null);

  // Reset on open/close
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setStep(1); setPhoto(null); setPhotoFile(null); setAnnotations([]);
        setDrawing(null); setTaskMode('new'); setSelectedTaskId('');
        setNewTitle(''); setAssignees([]); setNotes(''); setAnnotatedImageUrl(null);
        setTool('arrow'); setColor('#ef4444');
      }, 200);
    }
  }, [open]);

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setPhotoFile(f);
    const reader = new FileReader();
    reader.onload = (ev) => setPhoto(ev.target.result);
    reader.readAsDataURL(f);
  };

  // Draw all annotations on canvas
  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img || !img.complete) return;
    const ctx = canvas.getContext('2d');
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const scaleX = canvas.width / img.clientWidth;
    const scaleY = canvas.height / img.clientHeight;

    [...annotations, ...(drawing ? [drawing] : [])].forEach(ann => {
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = 4 * scaleX;
      ctx.fillStyle = ann.color;
      const x1 = ann.x1 * scaleX, y1 = ann.y1 * scaleY;
      const x2 = ann.x2 * scaleX, y2 = ann.y2 * scaleY;

      if (ann.type === 'line') {
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      } else if (ann.type === 'arrow') {
        // Line
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        // Arrowhead
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = 18 * scaleX;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath(); ctx.fill();
      } else if (ann.type === 'circle') {
        const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI); ctx.stroke();
      }
    });
  }, [annotations, drawing]);

  useEffect(() => { if (step === 2) redraw(); }, [annotations, drawing, step, redraw]);

  const getPos = (e, el) => {
    const rect = el.getBoundingClientRect();
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX - rect.left, y: src.clientY - rect.top };
  };

  const onMouseDown = (e) => {
    const img = imgRef.current;
    if (!img) return;
    const pos = getPos(e, img);
    setDrawing({ type: tool, color, x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
  };

  const onMouseMove = (e) => {
    if (!drawing) return;
    const img = imgRef.current;
    const pos = getPos(e, img);
    setDrawing(d => ({ ...d, x2: pos.x, y2: pos.y }));
  };

  const onMouseUp = () => {
    if (drawing) {
      setAnnotations(prev => [...prev, drawing]);
      setDrawing(null);
    }
  };

  const proceedToTask = () => {
    // Flatten canvas to data URL
    const canvas = canvasRef.current;
    if (canvas) setAnnotatedImageUrl(canvas.toDataURL('image/jpeg', 0.9));
    setStep(3);
  };

  const sendInAppNotification = async (assigneeName, taskTitle, isNew) => {
    const getFullName = (user) => [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email;
    const assigneeUser = allUsers.find(u => getFullName(u) === assigneeName);
    if (!assigneeUser) return;
    const message = isNew
      ? `You've been assigned a Fix It task: "${taskTitle}" on project "${projectName}". Priority set to High.`
      : `Fix It flagged on your task "${taskTitle}" in project "${projectName}". Task reset to incomplete, priority set to High.`;
    await base44.entities.Notification.create({
      user_id: assigneeUser.user_id || assigneeUser.id,
      type: 'task_assigned',
      title: `Fix It: ${taskTitle}`,
      message,
      project_id: projectId,
      project_name: projectName,
      read: false,
    });
  };

  const sendSubContractorFixItEmail = async (task, imageUrl) => {
    if (!task?.sub_contractor_id) return;
    await base44.functions.invoke('subContractorBid', {
      mode: 'send_fixit_email',
      subContractorId: task.sub_contractor_id,
      taskTitle: task.title,
      notes,
      imageUrl,
      projectName,
      projectAddress: project?.address || '',
    });
  };

  const handleSave = async () => {
    setSaving(true);

    // Upload annotated image
    let imageUrl = null;
    if (annotatedImageUrl) {
      const blob = await (await fetch(annotatedImageUrl)).blob();
      const file = new File([blob], 'fixit-annotation.jpg', { type: 'image/jpeg' });
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      imageUrl = file_url;
    }

    const noteText = [notes].filter(Boolean).join('\n');

    if (taskMode === 'new') {
      await base44.entities.Task.create({
        project_id: projectId,
        title: newTitle,
        assignees,
        assigned_to: assignees[0] || undefined,
        priority: 'high',
        status: 'pending',
        notes: noteText,
        photo_urls: imageUrl ? [imageUrl] : [],
      });
      // Attach photo as a ProjectFile too
      if (imageUrl) {
        await base44.entities.ProjectFile.create({
          project_id: projectId,
          name: `Fix It, ${newTitle}`,
          file_url: imageUrl,
          file_type: 'image/jpeg',
          category: 'corrections',
          uploaded_by: 'Fix It',
        });
      }
      for (const name of assignees) await sendInAppNotification(name, newTitle, true);
    } else {
      const existingTask = tasks.find(t => t.id === selectedTaskId);
      if (existingTask) {
        const existingNotes = existingTask.notes ? existingTask.notes + '\n\n' + noteText : noteText;
        const existingPhotos = existingTask.photo_urls || [];
        // Reassign the same people by default; the Fix-it picker (pre-filled with the task's current
        // assignees) can override to specific people.
        const finalAssignees = assignees.length ? assignees : taskAssignees(existingTask);
        await base44.entities.Task.update(selectedTaskId, {
          status: 'pending',
          priority: 'high',
          assignees: finalAssignees,
          assigned_to: finalAssignees[0] || '',
          notes: existingNotes || undefined,
          photo_urls: imageUrl ? [...existingPhotos, imageUrl] : existingPhotos,
        });
        // Attach photo as a ProjectFile too
        if (imageUrl) {
          await base44.entities.ProjectFile.create({
            project_id: projectId,
            name: `Fix It, ${existingTask.title}`,
            file_url: imageUrl,
            file_type: 'image/jpeg',
            category: 'corrections',
            uploaded_by: 'Fix It',
          });
        }
        if (existingTask.is_sub_contractor_task) {
          await sendSubContractorFixItEmail(existingTask, imageUrl);
        } else {
          for (const name of finalAssignees) await sendInAppNotification(name, existingTask.title, false);
        }
      }
    }

    setSaving(false);
    onOpenChange(false);
    onRefresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <Wrench className="w-4 h-4" /> Fix It
            <span className="text-xs font-normal text-muted-foreground ml-1">Step {step} of 3</span>
          </DialogTitle>
        </DialogHeader>

        {/* Step 1: Choose photo */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Take or upload a photo of the issue to annotate.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={handleFileChange} className="hidden" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => { fileRef.current.removeAttribute('capture'); fileRef.current.click(); }}>
                <Upload className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs">Upload Photo</span>
              </Button>
              <Button variant="outline" className="h-24 flex-col gap-2" onClick={() => { fileRef.current.setAttribute('capture', 'environment'); fileRef.current.click(); }}>
                <Camera className="w-6 h-6 text-muted-foreground" />
                <span className="text-xs">Take Photo</span>
              </Button>
            </div>
            {photo && (
              <div className="space-y-3">
                <img src={photo} alt="preview" className="w-full rounded-lg border object-contain max-h-48" />
                <Button onClick={() => setStep(2)} className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                  Annotate Photo →
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Annotate */}
        {step === 2 && (
          <div className="space-y-3">
            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex gap-1">
                {TOOLS.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setTool(t.id)}
                      className={`p-2 rounded-lg border transition-all ${tool === t.id ? 'border-accent bg-accent/10' : 'border-border hover:bg-muted'}`}
                      title={t.label}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-1.5">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-125' : 'border-transparent'}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
              <button
                onClick={() => setAnnotations([])}
                className="ml-auto flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive px-2 py-1 rounded border border-border hover:border-destructive/30 transition-all"
              >
                <RotateCcw className="w-3 h-3" /> Clear
              </button>
            </div>

            {/* Canvas overlay on image */}
            <div className="relative select-none rounded-lg overflow-hidden border border-border bg-muted">
              <img
                ref={imgRef}
                src={photo}
                alt="annotate"
                className="w-full object-contain max-h-[50vh]"
                draggable={false}
                onLoad={redraw}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full opacity-0 pointer-events-none"
              />
              {/* Transparent interaction layer */}
              <div
                className="absolute inset-0 cursor-crosshair"
                onMouseDown={onMouseDown}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onMouseLeave={onMouseUp}
                onTouchStart={e => { e.preventDefault(); onMouseDown(e); }}
                onTouchMove={e => { e.preventDefault(); onMouseMove(e); }}
                onTouchEnd={onMouseUp}
              >
                {/* SVG overlay for live drawing */}
                <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
                  {[...annotations, ...(drawing ? [drawing] : [])].map((ann, i) => {
                    const img = imgRef.current;
                    if (!img) return null;
                    const rect = img.getBoundingClientRect();
                    // positions are already in client space relative to img
                    if (ann.type === 'line') {
                      return <line key={i} x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={ann.color} strokeWidth="3" strokeLinecap="round" />;
                    } else if (ann.type === 'arrow') {
                      const angle = Math.atan2(ann.y2 - ann.y1, ann.x2 - ann.x1);
                      const hl = 16;
                      const ax1 = ann.x2 - hl * Math.cos(angle - Math.PI / 6);
                      const ay1 = ann.y2 - hl * Math.sin(angle - Math.PI / 6);
                      const ax2 = ann.x2 - hl * Math.cos(angle + Math.PI / 6);
                      const ay2 = ann.y2 - hl * Math.sin(angle + Math.PI / 6);
                      return (
                        <g key={i}>
                          <line x1={ann.x1} y1={ann.y1} x2={ann.x2} y2={ann.y2} stroke={ann.color} strokeWidth="3" strokeLinecap="round" />
                          <polygon points={`${ann.x2},${ann.y2} ${ax1},${ay1} ${ax2},${ay2}`} fill={ann.color} />
                        </g>
                      );
                    } else if (ann.type === 'circle') {
                      const rx = Math.abs(ann.x2 - ann.x1) / 2;
                      const ry = Math.abs(ann.y2 - ann.y1) / 2;
                      const cx = (ann.x1 + ann.x2) / 2;
                      const cy = (ann.y1 + ann.y2) / 2;
                      return <ellipse key={i} cx={cx} cy={cy} rx={rx} ry={ry} stroke={ann.color} strokeWidth="3" fill="none" />;
                    }
                    return null;
                  })}
                </svg>
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>← Back</Button>
              <Button onClick={proceedToTask} className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90">
                Next: Set Task →
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Task */}
        {step === 3 && (
          <div className="space-y-4">
            {annotatedImageUrl && (
              <img src={annotatedImageUrl} alt="annotated" className="w-full rounded-lg border object-contain max-h-36" />
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setTaskMode('new')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${taskMode === 'new' ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-muted'}`}
              >
                Create New Task
              </button>
              <button
                onClick={() => setTaskMode('existing')}
                className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-all ${taskMode === 'existing' ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-muted'}`}
              >
                Attach to Existing
              </button>
            </div>

            {taskMode === 'new' ? (
              <div className="space-y-3">
                <div>
                  <Label>Task Title *</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Describe what needs to be fixed" />
                </div>
                <div>
                  <Label>Assign To</Label>
                  <AssigneeSelect value={assignees} onChange={setAssignees} users={allUsers.filter(u => u.role !== 'client')} />
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Select Task</Label>
                  <Select
                    value={selectedTaskId}
                    onValueChange={id => { setSelectedTaskId(id); const t = tasks.find(x => x.id === id); setAssignees(t ? taskAssignees(t) : []); }}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a task…" /></SelectTrigger>
                    <SelectContent>
                      {tasks.map(t => {
                        const a = taskAssignees(t);
                        return <SelectItem key={t.id} value={t.id}>{t.title}{a.length ? `, ${a.join(', ')}` : ''}{t.status === 'completed' ? ' ✓' : ''}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                {selectedTaskId && (
                  <div>
                    <Label>Assign To</Label>
                    <AssigneeSelect value={assignees} onChange={setAssignees} users={allUsers.filter(u => u.role !== 'client')} />
                    <p className="text-[11px] text-muted-foreground mt-1">Defaults to the task's current people; change it to reassign.</p>
                  </div>
                )}
              </div>
            )}

            <div>
              <Label>Notes</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Describe the issue…" />
            </div>

            <div className="bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 text-xs text-orange-700">
              Priority will be set to <strong>High</strong>. Photo will be saved to the project's Corrections files. Assignee will be notified in the app.
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>← Back</Button>
              <Button
                onClick={handleSave}
                disabled={saving || (taskMode === 'new' ? !newTitle.trim() : !selectedTaskId)}
                className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {saving ? 'Saving...' : <><Check className="w-4 h-4 mr-1" /> Submit Fix It</>}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}