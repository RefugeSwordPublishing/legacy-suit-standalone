import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapPin, Calendar, ArrowRight, KeyRound } from 'lucide-react';
import { format } from 'date-fns';
import ProjectTimecardsModal from '@/components/projects/ProjectTimecardsModal';
import { useCurrentUser } from '@/lib/UserContext';

const HIGH_ROLES = ['owner', 'coo', 'admin'];

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-secondary text-primary border-border' },
  active: { label: 'Active', className: 'bg-primary text-primary-foreground border-primary' },
  on_hold: { label: 'On Hold', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function ProjectCard({ project, taskCount, materialCount, hoursLogged, managerHoursLogged }) {
  const { currentUser } = useCurrentUser();
  const [showTimecards, setShowTimecards] = useState(false);
  const canViewTimecards = HIGH_ROLES.includes(currentUser?.role);
  const status = statusConfig[project.status] || statusConfig.planning;
  const budgetHours = project.budget_hours || 0;
  const crewHours = hoursLogged || 0;
  const mgHours = managerHoursLogged || 0;
  const loggedHours = crewHours + mgHours;
  const hoursPercent = budgetHours > 0 ? Math.min((loggedHours / budgetHours) * 100, 100) : null;
  const crewPercent = budgetHours > 0 ? Math.min((crewHours / budgetHours) * 100, 100) : 0;
  const mgPercent = budgetHours > 0 ? Math.min((mgHours / budgetHours) * 100, 100) : 0;

  return (
    <>
    <Link to={`/projects/${project.id}`}>
      <Card className="p-5 hover:shadow-lg transition-all duration-300 border border-border hover:border-accent/40 group cursor-pointer">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground truncate group-hover:text-accent transition-colors">
              {project.name}
            </h3>
            {project.client_name && (
              <p className="text-sm text-muted-foreground mt-0.5">{project.client_name}</p>
            )}
          </div>
          <Badge variant="outline" className={`${status.className} shrink-0 ml-2 text-xs`}>
            {status.label}
          </Badge>
        </div>

        {project.address && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3">
            <MapPin className="w-3 h-3" />
            <span className="truncate">{project.address}</span>
          </div>
        )}

        {project.lockbox_code && (
          <div className="flex items-center gap-1.5 mb-3">
            <KeyRound className="w-3.5 h-3.5 text-accent shrink-0" />
            <span className="text-xs text-muted-foreground">Lockbox</span>
            <span className="text-sm font-bold text-foreground tracking-wider">{project.lockbox_code}</span>
          </div>
        )}

        {hoursPercent !== null && (
          <div
            className={`mb-3 ${canViewTimecards ? 'cursor-pointer group/hours' : ''}`}
            onClick={canViewTimecards ? (e) => { e.preventDefault(); e.stopPropagation(); setShowTimecards(true); } : undefined}
          >
            <div className="flex justify-between text-xs text-muted-foreground mb-1">
              <span className={canViewTimecards ? 'group-hover/hours:text-accent transition-colors' : ''}>Hours Logged</span>
              <span>{loggedHours.toFixed(1)}h / {budgetHours}h</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden flex">
              <div
                className={`h-full transition-all ${hoursPercent >= 90 ? 'bg-red-500' : hoursPercent >= 70 ? 'bg-amber-500' : ''}`}
                style={{ width: `${crewPercent}%`, backgroundColor: hoursPercent >= 90 ? undefined : hoursPercent >= 70 ? undefined : 'hsl(var(--primary))' }}
              />
              {mgPercent > 0 && (
                <div
                  className="h-full transition-all"
                  style={{ width: `${mgPercent}%`, backgroundColor: 'hsl(var(--accent))' }}
                />
              )}
            </div>
            {mgPercent > 0 && (
              <div className="flex items-center gap-3 mt-1">
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'hsl(var(--primary))' }} />Crew {crewHours.toFixed(1)}h</span>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'hsl(var(--accent))' }} />Manager {mgHours.toFixed(1)}h</span>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-border">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>{taskCount} open {taskCount === 1 ? 'task' : 'tasks'}</span>
            <span>{materialCount} {materialCount === 1 ? 'material' : 'materials'} needed</span>
          </div>
          {project.target_end_date && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="w-3 h-3" />
              {format(new Date(project.target_end_date), 'MMM d')}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end mt-2 text-xs text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
          View Details <ArrowRight className="w-3 h-3 ml-1" />
        </div>
      </Card>
    </Link>
    {canViewTimecards && (
      <ProjectTimecardsModal
        open={showTimecards}
        onOpenChange={setShowTimecards}
        project={project}
      />
    )}
    </>
  );
}