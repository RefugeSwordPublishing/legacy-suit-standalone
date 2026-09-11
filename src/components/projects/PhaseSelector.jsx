import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const PHASES = [
  { value: 'phase_1', label: 'Phase 1' },
  { value: 'phase_2', label: 'Phase 2' },
  { value: 'phase_3', label: 'Phase 3' },
  { value: 'phase_4', label: 'Phase 4' },
  { value: 'phase_5', label: 'Phase 5' },
  { value: 'phase_6', label: 'Phase 6' },
];

const phaseColors = {
  phase_1: 'bg-violet-100 text-violet-700 border-violet-200',
  phase_2: 'bg-blue-100 text-blue-700 border-blue-200',
  phase_3: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  phase_4: 'bg-amber-100 text-amber-700 border-amber-200',
  phase_5: 'bg-orange-100 text-orange-700 border-orange-200',
  phase_6: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function PhaseSelector({ project, canEdit }) {
  const queryClient = useQueryClient();

  const handleChange = async (val) => {
    await base44.entities.Project.update(project.id, { phase: val });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
  };

  if (!project.phase && !canEdit) return null;

  const phaseLabel = PHASES.find(p => p.value === project.phase)?.label;

  if (!canEdit) {
    return project.phase ? (
      <Badge variant="outline" className={`text-xs ${phaseColors[project.phase]}`}>
        {phaseLabel}
      </Badge>
    ) : null;
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-muted-foreground font-medium">Phase:</span>
      <Select value={project.phase || ''} onValueChange={handleChange}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue placeholder="Set phase" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No Phase</SelectItem>
          {PHASES.map(p => (
            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}