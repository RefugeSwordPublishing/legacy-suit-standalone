import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Clock } from 'lucide-react';
import { useCurrentUser } from '@/lib/UserContext';
import ProjectTimecardsModal from '@/components/projects/ProjectTimecardsModal';

const HIGH_ROLES = ['owner', 'coo', 'admin'];

function formatHours(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function ProjectHoursBar({ projectId, budgetHours, project }) {
  const { currentUser } = useCurrentUser();
  const [showTimecards, setShowTimecards] = useState(false);
  const canViewTimecards = HIGH_ROLES.includes(currentUser?.role);
  const { data: entries = [] } = useQuery({
    queryKey: ['time-entries-project', projectId],
    queryFn: () => base44.entities.TimeEntry.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const completed = entries.filter(e => e.status === 'clocked_out' && e.duration_minutes);
  const crewMinutes = completed.filter(e => e.user_role !== 'site_manager').reduce((sum, e) => sum + e.duration_minutes, 0);
  const mgMinutes = completed.filter(e => e.user_role === 'site_manager').reduce((sum, e) => sum + e.duration_minutes, 0);
  const loggedMinutes = crewMinutes + mgMinutes;

  const loggedHours = loggedMinutes / 60;
  const percent = budgetHours > 0 ? Math.min((loggedHours / budgetHours) * 100, 100) : null;
  const overBudget = budgetHours > 0 && loggedHours > budgetHours;
  const crewPercent = budgetHours > 0 ? Math.min((crewMinutes / 60 / budgetHours) * 100, 100) : 0;
  const mgPercent = budgetHours > 0 ? Math.min((mgMinutes / 60 / budgetHours) * 100, 100) : 0;

  return (
    <>
    <div
      className={`flex items-center gap-2 text-xs text-muted-foreground ${canViewTimecards ? 'cursor-pointer hover:text-accent transition-colors' : ''}`}
      onClick={canViewTimecards ? () => setShowTimecards(true) : undefined}
    >
      <Clock className="w-3.5 h-3.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span>Hours Logged</span>
          <span className={`font-medium ${overBudget ? 'text-red-600' : 'text-foreground'}`}>
            {formatHours(loggedMinutes)}{budgetHours ? ` / ${budgetHours}h` : ''}
          </span>
        </div>
        {budgetHours > 0 && percent !== null && (
          <div className="w-full bg-muted rounded-full h-1.5 flex overflow-hidden">
            <div
              className={`h-1.5 transition-all ${overBudget ? 'bg-red-500' : 'bg-accent'}`}
              style={{ width: `${crewPercent}%` }}
            />
            {mgPercent > 0 && (
              <div className="h-1.5 bg-blue-400 transition-all" style={{ width: `${mgPercent}%` }} />
            )}
          </div>
        )}
        {mgMinutes > 0 && (
          <div className="flex items-center gap-3 mt-0.5">
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />Crew</span>
            <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />Manager</span>
          </div>
        )}
      </div>
    </div>
    {canViewTimecards && (
      <ProjectTimecardsModal
        open={showTimecards}
        onOpenChange={setShowTimecards}
        project={project || { id: projectId }}
      />
    )}
    </>
  );
}