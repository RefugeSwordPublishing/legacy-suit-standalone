import { useState } from 'react';
import { format, addDays, isToday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';

const CELL_WIDTH = 120; // px

function ProjectCell({ entry, project, coworkers }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full rounded px-2 py-1.5 text-[11px] font-medium text-white text-left leading-tight transition-all"
        style={{ backgroundColor: project?.color || '#3B82F6' }}
      >
        <span className="flex items-start gap-1.5">
          <span className="whitespace-normal break-words flex-1">
            {project?.name || 'Unknown Project'}
          </span>
          {project?.phase && (
            <span className="text-[9px] font-bold bg-black/20 rounded px-1 py-0.5 leading-none shrink-0 mt-0.5">
              {project.phase.replace('phase_', 'P')}
            </span>
          )}
        </span>
        {coworkers.length > 0 && (
          <span className="flex items-center gap-0.5 mt-0.5 text-white/80 text-[10px]">
            <Users className="w-2.5 h-2.5" /> {coworkers.length} other{coworkers.length > 1 ? 's' : ''}
          </span>
        )}
      </button>

      {/* Expanded tooltip/panel showing co-workers */}
      {expanded && coworkers.length > 0 && (
        <div
          className="absolute z-30 left-0 top-full mt-1 bg-popover border border-border rounded-lg shadow-xl p-2 w-48 space-y-1"
          onClick={e => e.stopPropagation()}
        >
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Also assigned:</p>
          {coworkers.map((cw, i) => (
            <p key={i} className="text-xs text-foreground truncate">{cw}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WeeklyView({ weekStart, onPrevWeek, onNextWeek, scheduleEntries, projects, currentUserId, isSiteManager, allUsers }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const getEntriesForDay = (date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return scheduleEntries.filter(e => e.user_id === currentUserId && e.scheduled_date === dateStr);
  };

  // For site managers: get names of co-workers assigned to the same project on the same day
  const getCoworkersForEntry = (entry) => {
    if (!isSiteManager) return [];
    const others = scheduleEntries.filter(
      e => e.project_id === entry.project_id &&
           e.scheduled_date === entry.scheduled_date &&
           e.user_id !== currentUserId
    );
    return others.map(e => {
      const u = allUsers?.find(u => u.user_id === e.user_id || u.id === e.user_id);
      if (u) return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.full_name || u.email;
      return e.user_name || 'Unknown';
    });
  };

  const getProject = (projectId) => projects.find(p => p.id === projectId);

  const totalGridWidth = 0; // full width for weekly view

  return (
    <div className="space-y-4 w-full">
      {/* Week navigation */}
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onPrevWeek}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold">
          {format(weekStart, 'MMM d')} - {format(addDays(weekStart, 6), 'MMM d, yyyy')}
        </span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={onNextWeek}>
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {/* Calendar grid */}
      <div className="border border-border rounded-xl overflow-x-hidden bg-card">
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            {/* Sticky header */}
            <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-border bg-muted/60">
              {days.map((day, i) => {
                const today = isToday(day);
                return (
                  <div
                    key={i}
                    className={`text-center py-2.5 border-r last:border-r-0 border-border ${today ? 'bg-accent/10' : ''}`}
                  >
                    <p className={`text-[11px] font-semibold uppercase tracking-wide ${today ? 'text-accent' : 'text-muted-foreground'}`}>
                      {format(day, 'EEE')}
                    </p>
                    <p className={`text-xl font-bold leading-tight ${today ? 'text-accent' : 'text-foreground'}`}>
                      {format(day, 'd')}
                    </p>
                    <p className={`text-[10px] ${today ? 'text-accent/70' : 'text-muted-foreground'}`}>
                      {format(day, 'MMM')}
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Content row */}
            <div className="grid grid-cols-7">
              {days.map((day, i) => {
                const entries = getEntriesForDay(day);
                const today = isToday(day);
                return (
                  <div
                    key={i}
                    className={`min-h-[100px] p-1.5 border-r last:border-r-0 border-border ${today ? 'bg-accent/5' : ''}`}
                  >
                    {entries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground italic mt-1 px-1">Off</p>
                    ) : (
                      <div className="space-y-1">
                        {entries.map(entry => {
                          const project = getProject(entry.project_id);
                          const coworkers = getCoworkersForEntry(entry);
                          return (
                            <ProjectCell
                              key={entry.id}
                              entry={entry}
                              project={project}
                              coworkers={coworkers}
                            />
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {isSiteManager && (
        <p className="text-xs text-muted-foreground">Tap a project to see who else is assigned that day.</p>
      )}
    </div>
  );
}