import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from 'date-fns';

export default function WeeklyScheduleView({ projects, onEditColor }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const weekStart = startOfWeek(currentDate);
  const weekEnd = endOfWeek(currentDate);

  const dayLabels = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(date.getDate() + i);
    dayLabels.push({
      date,
      label: format(date, 'EEE'),
      fullDate: format(date, 'MMM d'),
    });
  }

  const getBarPosition = (project) => {
    if (!project.start_date || !project.target_end_date) return null;
    
    const projectStart = new Date(project.start_date);
    const projectEnd = new Date(project.target_end_date);

    let startDayIdx = -1, endDayIdx = -1;
    for (let i = 0; i < dayLabels.length; i++) {
      const dayDate = dayLabels[i].date;
      if (startDayIdx === -1 && dayDate >= projectStart) startDayIdx = i;
      if (dayDate <= projectEnd) endDayIdx = i;
    }
    
    if (startDayIdx < 0 || endDayIdx < 0) return null;
    
    const barStart = Math.max(0, startDayIdx);
    const barLength = Math.min(7, endDayIdx + 1) - barStart;
    const barLeftPercent = (barStart / 7) * 100;
    const barWidthPercent = (barLength / 7) * 100;
    
    return { barLeftPercent, barWidthPercent };
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">
          {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Timeline header */}
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted-foreground px-48">
        {dayLabels.map(day => (
          <div key={day.fullDate}>
            <div>{day.label}</div>
            <div className="text-muted-foreground/60">{day.fullDate}</div>
          </div>
        ))}
      </div>

      {/* Gantt chart */}
      <div className="space-y-3 border-l-2 border-border pl-0">
        {projects.map(project => {
          const pos = getBarPosition(project);
          
          return (
            <div key={project.id} className="flex items-center gap-4">
              <div className="w-44 flex-shrink-0">
                <p className="text-sm font-medium text-foreground truncate">{project.name}</p>
                <p className="text-xs text-muted-foreground">📍 {project.siteManagerName}</p>
                <p className="text-xs text-muted-foreground">✓ {project.percentComplete}%</p>
              </div>
              <div className="flex-1 relative h-2 bg-muted/20 rounded-full">
                {pos && (
                  <div
                    className="h-full rounded-full transition-all hover:h-3 hover:cursor-pointer hover:opacity-90 hover:-my-0.5"
                    style={{
                      position: 'absolute',
                      left: `${pos.barLeftPercent}%`,
                      width: `${pos.barWidthPercent}%`,
                      backgroundColor: project.color || '#3B82F6',
                    }}
                    onClick={() => onEditColor(project)}
                    title={project.name}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}