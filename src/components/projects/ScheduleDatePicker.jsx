import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, isSameMonth, isWithinInterval,
  differenceInDays, max, min, parseISO, isSameDay, isToday
} from 'date-fns';

export default function ScheduleDatePicker({ value, onChange, excludeProjectId }) {
  const [open, setOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState(value ? parseISO(value) : new Date());

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
    enabled: open,
  });

  // Exclude the project being edited
  const projects = allProjects.filter(p =>
    p.start_date && p.target_end_date && p.id !== excludeProjectId
  );

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const visibleProjects = projects.filter(p => {
    const s = parseISO(p.start_date);
    const e = parseISO(p.target_end_date);
    return s <= calEnd && e >= calStart;
  });

  const getSegments = (project) => {
    const projStart = parseISO(project.start_date);
    const projEnd = parseISO(project.target_end_date);
    return weeks.map((week, weekIdx) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      if (projEnd < weekStart || projStart > weekEnd) return null;
      const barStart = max([projStart, weekStart]);
      const barEnd = min([projEnd, weekEnd]);
      return {
        weekIdx,
        colStart: differenceInDays(barStart, weekStart),
        colEnd: differenceInDays(barEnd, weekStart),
      };
    }).filter(Boolean);
  };

  const weekBarSlots = weeks.map(() => []);
  visibleProjects.forEach(project => {
    const segments = getSegments(project);
    segments.forEach(seg => {
      const slot = weekBarSlots[seg.weekIdx];
      let row = 0;
      while (slot.some(b => b.row === row && !(b.colEnd < seg.colStart || b.colStart > seg.colEnd))) row++;
      slot.push({ ...seg, row, project });
    });
  });

  const maxRowsPerWeek = weeks.map((_, wi) => {
    const rows = weekBarSlots[wi].map(b => b.row);
    return rows.length ? Math.max(...rows) + 1 : 0;
  });

  const BAR_H = 14;
  const BAR_GAP = 3;
  const DAY_PAD = 26;

  const handleSelectDay = (day) => {
    onChange(format(day, 'yyyy-MM-dd'));
    // If user clicked a day outside current month, navigate there
    if (!isSameMonth(day, currentDate)) setCurrentDate(day);
    setOpen(false);
  };

  const selectedDate = value ? parseISO(value) : null;

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start text-left font-normal gap-2 min-w-0"
        onClick={() => setOpen(true)}
      >
        <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" />
        <span className="truncate text-xs">
          {value ? format(parseISO(value), 'MMM d, yyyy') : <span className="text-muted-foreground">Pick start date…</span>}
        </span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4">
          <DialogHeader>
            <DialogTitle className="text-base">Pick a Start Date</DialogTitle>
            <p className="text-xs text-muted-foreground">Tap a day to set the project start date. Existing project bars are shown for reference.</p>
          </DialogHeader>

          <div className="space-y-3">
            {/* Month navigation */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{format(currentDate, 'MMMM yyyy')}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>

            {/* Calendar grid */}
            <div className="border border-border rounded-lg overflow-hidden bg-card text-sm">
              {/* Headers */}
              <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                  <div key={d} className="p-1.5 text-center text-[11px] font-semibold text-muted-foreground border-r border-border last:border-r-0">
                    {d}
                  </div>
                ))}
              </div>

              {weeks.map((week, weekIdx) => {
                const numRows = maxRowsPerWeek[weekIdx];
                const rowHeight = DAY_PAD + numRows * (BAR_H + BAR_GAP) + 6;
                const barsThisWeek = weekBarSlots[weekIdx];

                return (
                  <div
                    key={weekIdx}
                    className="relative grid grid-cols-7 border-b border-border last:border-b-0"
                    style={{ minHeight: rowHeight }}
                  >
                    {week.map((day, dayIdx) => {
                      const inMonth = isSameMonth(day, currentDate);
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isCurrentDay = isToday(day);
                      return (
                        <div
                          key={dayIdx}
                          onClick={() => handleSelectDay(day)}
                          className={[
                            'border-r border-border last:border-r-0 transition-colors cursor-pointer hover:bg-accent/10',
                            !inMonth ? 'bg-muted/20' : '',
                            isSelected ? 'bg-accent/20' : '',
                          ].join(' ')}
                          style={{ minHeight: rowHeight }}
                        >
                          <p className={[
                            'text-[11px] font-semibold p-1.5 w-fit rounded-full mx-auto text-center',
                            isSelected ? 'bg-accent text-accent-foreground w-6 h-6 flex items-center justify-center' : '',
                            isCurrentDay && !isSelected ? 'text-accent font-bold' : '',
                            !inMonth ? 'text-muted-foreground/40' : 'text-foreground',
                          ].join(' ')}>
                            {format(day, 'd')}
                          </p>
                        </div>
                      );
                    })}

                    {/* Project bars */}
                    {barsThisWeek.map(({ colStart, colEnd, row, project }) => {
                      const spanCols = colEnd - colStart + 1;
                      const leftPct = (colStart / 7) * 100;
                      const widthPct = (spanCols / 7) * 100;
                      const topPx = DAY_PAD + row * (BAR_H + BAR_GAP);
                      const projStart = parseISO(project.start_date);
                      const projEnd = parseISO(project.target_end_date);
                      const isBarStart = differenceInDays(week[colStart], projStart) === 0 || colStart === 0;
                      const isBarEnd = differenceInDays(week[colEnd], projEnd) === 0 || colEnd === 6;

                      return (
                        <div
                          key={`${project.id}-${weekIdx}`}
                          className="absolute pointer-events-none flex items-center overflow-hidden"
                          style={{
                            left: `calc(${leftPct}% + 1px)`,
                            width: `calc(${widthPct}% - 2px)`,
                            top: topPx,
                            height: BAR_H,
                            backgroundColor: project.color || '#3B82F6',
                            opacity: 0.85,
                            borderRadius: `${isBarStart ? '5px' : '0'} ${isBarEnd ? '5px' : '0'} ${isBarEnd ? '5px' : '0'} ${isBarStart ? '5px' : '0'}`,
                            zIndex: 2,
                          }}
                          title={`${project.name}: ${format(projStart, 'MMM d')} - ${format(projEnd, 'MMM d, yyyy')}`}
                        >
                          {isBarStart && (
                            <span className="text-white text-[10px] font-semibold px-1.5 truncate leading-none">
                              {project.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>

            {value && (
              <p className="text-xs text-center text-muted-foreground">
                Selected: <strong>{format(parseISO(value), 'MMMM d, yyyy')}</strong>
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}