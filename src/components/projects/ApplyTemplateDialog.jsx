import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, CheckCircle2, Layers } from 'lucide-react';

const phaseColors = {
  phase_1: 'bg-violet-100 text-violet-700', phase_2: 'bg-blue-100 text-blue-700',
  phase_3: 'bg-cyan-100 text-cyan-700', phase_4: 'bg-amber-100 text-amber-700',
  phase_5: 'bg-orange-100 text-orange-700', phase_6: 'bg-emerald-100 text-emerald-700',
};
const phaseLabel = { phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3', phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6' };

export default function ApplyTemplateDialog({ open, onOpenChange, projectId, onApplied }) {
  const [selected, setSelected] = useState(null);
  const [applying, setApplying] = useState(false);

  const { data: templates = [] } = useQuery({
    queryKey: ['templates'],
    queryFn: () => base44.entities.TaskTemplate.list('-created_date'),
    enabled: open,
  });

  const handleApply = async () => {
    if (!selected) return;
    setApplying(true);
    const template = templates.find(t => t.id === selected);
    if (template?.tasks?.length) {
      await Promise.all(
        template.tasks.map(task =>
          base44.entities.Task.create({
            project_id: projectId,
            title: task.title,
            priority: task.priority || 'medium',
            notes: task.notes || '',
            status: 'pending',
            phase: template.phase || undefined,
          })
        )
      );
    }
    setApplying(false);
    setSelected(null);
    onOpenChange(false);
    onApplied();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4" />
            Apply Task Template
          </DialogTitle>
        </DialogHeader>
        {templates.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No templates yet. Create one from the Templates page.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {templates.map(t => (
                <button
                  key={t.id}
                  onClick={() => setSelected(t.id)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    selected === t.id
                      ? 'border-accent bg-accent/5'
                      : 'border-border hover:border-accent/40 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                     <p className="text-sm font-medium">{t.name}</p>
                     <div className="flex items-center gap-2">
                       {t.phase && (
                         <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex items-center gap-0.5 ${phaseColors[t.phase]}`}>
                           <Layers className="w-2.5 h-2.5" />{phaseLabel[t.phase]}
                         </span>
                       )}
                       <Badge variant="outline" className="text-xs">{t.tasks?.length || 0} tasks</Badge>
                       {selected === t.id && <CheckCircle2 className="w-4 h-4 text-accent" />}
                     </div>
                   </div>
                  {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                  {t.tasks?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {t.tasks.slice(0, 3).map((task, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground inline-block shrink-0" />
                          {task.title}
                        </li>
                      ))}
                      {t.tasks.length > 3 && (
                        <li className="text-xs text-muted-foreground/60">+{t.tasks.length - 3} more…</li>
                      )}
                    </ul>
                  )}
                </button>
              ))}
            </div>
            <Button
              onClick={handleApply}
              disabled={!selected || applying}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              {applying ? 'Applying...' : 'Apply Template'}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}