import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, eachDayOfInterval, isSameMonth, isWithinInterval,
  differenceInDays, max, min, parseISO
} from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';

export default function MonthlyScheduleView({ projects, subContractorTasks = [], onEditColor, onSelectItem }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [newProjectDate, setNewProjectDate] = useState(null);
  const [newProjectName, setNewProjectName] = useState('');
  const [creating, setCreating] = useState(false);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const calStart = startOfWeek(monthStart);
  const calEnd = endOfWeek(monthEnd);

  const days = eachDayOfInterval({ start: calStart, end: calEnd });
  const weeks = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  // For each project, compute which segments it occupies per week row
  const visibleProjects = projects.filter(p => {
    if (!p.start_date || !p.target_end_date) return false;
    const s = parseISO(p.start_date);
    const e = parseISO(p.target_end_date);
    return s <= calEnd && e >= calStart;
  });

  // Returns bar segments per week: { weekIdx, colStart (0-6), colEnd (0-6) }
  const getSegments = (project) => {
    const projStart = parseISO(project.start_date);
    const projEnd = parseISO(project.target_end_date);
    return weeks.map((week, weekIdx) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      if (projEnd < weekStart || projStart > weekEnd) return null;
      const barStart = max([projStart, weekStart]);
      const barEnd = min([projEnd, weekEnd]);
      const colStart = differenceInDays(barStart, weekStart);
      const colEnd = differenceInDays(barEnd, weekStart);
      return { weekIdx, colStart, colEnd };
    }).filter(Boolean);
  };

  // Build a structure: for each week, a list of {project, colStart, colEnd, row}
  // so bars don't overlap, assign each project a row slot per week
  const weekBarSlots = weeks.map(() => []); // array of arrays
  const projectSegmentMap = visibleProjects.map(project => {
    const segments = getSegments(project);
    const assignedRows = {};
    segments.forEach(seg => {
      const slot = weekBarSlots[seg.weekIdx];
      // find first row not occupied in colStart..colEnd
      let row = 0;
      while (true) {
        const rowOccupied = slot.some(
          b => b.row === row && !(b.colEnd < seg.colStart || b.colStart > seg.colEnd)
        );
        if (!rowOccupied) break;
        row++;
      }
      slot.push({ ...seg, row, project });
      assignedRows[seg.weekIdx] = row;
    });
    return { project, segments, assignedRows };
  });

  // Sub-contractor tasks as calendar bars
  const visibleSubTasks = subContractorTasks.filter(t => {
    const s = parseISO(t.eta_start);
    const e = parseISO(t.eta_end);
    return s <= calEnd && e >= calStart;
  });

  const getSubTaskSegments = (task) => {
    const taskStart = parseISO(task.eta_start);
    const taskEnd = parseISO(task.eta_end);
    return weeks.map((week, weekIdx) => {
      const weekStart = week[0];
      const weekEnd = week[6];
      if (taskEnd < weekStart || taskStart > weekEnd) return null;
      const barStart = max([taskStart, weekStart]);
      const barEnd = min([taskEnd, weekEnd]);
      const colStart = differenceInDays(barStart, weekStart);
      const colEnd = differenceInDays(barEnd, weekStart);
      return { weekIdx, colStart, colEnd };
    }).filter(Boolean);
  };

  // Add sub-contractor tasks into weekBarSlots (after projects)
  const subTaskSegmentMap = visibleSubTasks.map(task => {
    const segments = getSubTaskSegments(task);
    const assignedRows = {};
    segments.forEach(seg => {
      const slot = weekBarSlots[seg.weekIdx];
      let row = 0;
      while (true) {
        const rowOccupied = slot.some(
          b => b.row === row && !(b.colEnd < seg.colStart || b.colStart > seg.colEnd)
        );
        if (!rowOccupied) break;
        row++;
      }
      slot.push({ ...seg, row, subTask: task });
      assignedRows[seg.weekIdx] = row;
    });
    return { task, segments, assignedRows };
  });

  // Max rows per week (to set min height)
  const maxRowsPerWeek = weeks.map((_, wi) => {
    const rows = weekBarSlots[wi].map(b => b.row);
    return rows.length ? Math.max(...rows) + 1 : 0;
  });

  const BAR_H = 18;    // px per bar
  const BAR_GAP = 4;   // px between bars
  const DAY_PAD = 28;  // px for date number

  const handleCreateProject = async () => {
    if (!newProjectName.trim() || !newProjectDate) return;
    setCreating(true);
    try {
      await base44.entities.Project.create({
        name: newProjectName,
        start_date: format(newProjectDate, 'yyyy-MM-dd'),
        status: 'planning',
      });
      setNewProjectName('');
      setNewProjectDate(null);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{format(currentDate, 'MMMM yyyy')}</h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(subMonths(currentDate, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(addMonths(currentDate, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded-sm bg-blue-500" />
          <span>Project</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-4 h-3 rounded-sm" style={{ backgroundColor: '#92400e', backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.2) 3px, rgba(255,255,255,0.2) 6px)' }} />
          <span>Sub-Contractor</span>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        {/* Day of week headers */}
        <div className="grid grid-cols-7 bg-muted/50 border-b border-border">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="p-2 text-center text-xs font-semibold text-muted-foreground border-r border-border last:border-r-0">
              {d}
            </div>
          ))}
        </div>

        {/* Week rows */}
        {weeks.map((week, weekIdx) => {
          const numRows = maxRowsPerWeek[weekIdx];
          const rowHeight = DAY_PAD + numRows * (BAR_H + BAR_GAP) + 8;
          const barsThisWeek = weekBarSlots[weekIdx];

          return (
            <div key={weekIdx} className="relative grid grid-cols-7 border-b border-border last:border-b-0" style={{ minHeight: rowHeight }}>
              {/* Day cells */}
              {week.map((day, dayIdx) => {
                const inMonth = isSameMonth(day, currentDate);
                return (
                  <div
                    key={dayIdx}
                    onClick={() => inMonth && setNewProjectDate(day)}
                    className={`border-r border-border last:border-r-0 cursor-pointer hover:bg-muted/10 transition-colors ${!inMonth ? 'bg-muted/20' : ''}`}
                    style={{ minHeight: rowHeight }}
                  >
                    <p className={`text-xs font-semibold p-2 ${inMonth ? 'text-foreground' : 'text-muted-foreground/50'}`}>
                      {format(day, 'd')}
                    </p>
                  </div>
                );
              })}

              {/* Project bars overlaid absolutely */}
              {barsThisWeek.map(({ colStart, colEnd, row, project, subTask }) => {
                // Sub-contractor task bars
                if (subTask) {
                  const spanCols = colEnd - colStart + 1;
                  const leftPct = (colStart / 7) * 100;
                  const widthPct = (spanCols / 7) * 100;
                  const topPx = DAY_PAD + row * (BAR_H + BAR_GAP);
                  const taskStart = parseISO(subTask.eta_start);
                  const taskEnd = parseISO(subTask.eta_end);
                  const isStart = differenceInDays(week[colStart], taskStart) === 0 || colStart === 0;
                  const isEnd = differenceInDays(week[colEnd], taskEnd) === 0;
                  const contractorDisplay = subTask.sub_contractor_name || 'Unknown Contractor';
                  const barLabel = `${contractorDisplay} • ${subTask.project_name} • ${subTask.title}`;
                  return (
                    <div
                      key={`sub-${subTask.id}-${row}-${weekIdx}`}
                      className="absolute flex items-center overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      style={{
                        left: `calc(${leftPct}% + 1px)`,
                        width: `calc(${widthPct}% - 2px)`,
                        top: topPx,
                        height: BAR_H,
                        backgroundColor: '#92400e',
                        backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.15) 4px, rgba(255,255,255,0.15) 8px)',
                        borderRadius: `${isStart ? '6px' : '0'} ${isEnd ? '6px' : '0'} ${isEnd ? '6px' : '0'} ${isStart ? '6px' : '0'}`,
                        zIndex: 2,
                      }}
                      onClick={e => { e.stopPropagation(); onSelectItem && onSelectItem({ ...subTask, _isSubTask: true }); }}
                      title={`${barLabel}\n${format(taskStart, 'MMM d')} - ${format(taskEnd, 'MMM d, yyyy')}`}
                    >
                      {isStart && (
                        <span className="text-white text-[10px] font-semibold px-2 truncate leading-none flex items-center gap-1 min-w-0">
                          <span className="opacity-80">🔧</span> {barLabel}
                        </span>
                      )}
                    </div>
                  );
                }
              })}

              {/* Project bars overlaid absolutely */}
              {barsThisWeek.filter(b => b.project && !b.subTask).map(({ colStart, colEnd, row, project }) => {
                const spanCols = colEnd - colStart + 1;
                const leftPct = (colStart / 7) * 100;
                const widthPct = (spanCols / 7) * 100;
                const topPx = DAY_PAD + row * (BAR_H + BAR_GAP);
                const isStart = !isSameMonth(parseISO(project.start_date), currentDate)
                  ? colStart === 0
                  : differenceInDays(week[colStart], parseISO(project.start_date)) === 0;
                const projEndD = parseISO(project.target_end_date);
                const isEnd = differenceInDays(week[colEnd], projEndD) === 0;

                // Determine where to show the phase badge: at phase_since date if it falls in this segment,
                // or at the project start if no phase_since (defaults to start)
                const phaseSinceDate = project.phase_since ? parseISO(project.phase_since) : parseISO(project.start_date);
                const barStartDay = week[colStart];
                const barEndDay = week[colEnd];
                let phaseBadgeLeftPct = null;
                if (phaseSinceDate >= barStartDay && phaseSinceDate <= barEndDay) {
                  const barSpanDays = differenceInDays(barEndDay, barStartDay) + 1;
                  const offsetDays = differenceInDays(phaseSinceDate, barStartDay);
                  // Position badge at the day column within the bar
                  phaseBadgeLeftPct = (offsetDays / barSpanDays) * 100;
                }

                return (
                  <div
                    key={`${project.id}-${weekIdx}`}
                    className="absolute cursor-pointer hover:opacity-80 transition-opacity flex items-center overflow-hidden"
                    style={{
                      left: `calc(${leftPct}% + 1px)`,
                      width: `calc(${widthPct}% - 2px)`,
                      top: topPx,
                      height: BAR_H,
                      backgroundColor: project.color || '#3B82F6',
                      borderRadius: `${isStart ? '6px' : '0'} ${isEnd ? '6px' : '0'} ${isEnd ? '6px' : '0'} ${isStart ? '6px' : '0'}`,
                      zIndex: 2,
                    }}
                    onClick={e => { e.stopPropagation(); onSelectItem ? onSelectItem(project) : onEditColor(project); }}
                    title={`${project.name}: ${format(parseISO(project.start_date), 'MMM d')} - ${format(projEndD, 'MMM d, yyyy')}`}
                  >
                    {/* Project name at bar start */}
                    {isStart && (
                      <span className="text-white text-[11px] font-semibold px-2 truncate leading-none min-w-0">
                        {project.name}
                      </span>
                    )}
                    {/* Phase badge pinned to the phase_since column within the bar */}
                    {project.phase && phaseBadgeLeftPct !== null && (
                      <span
                        className="absolute text-[9px] font-bold bg-black/25 text-white rounded px-1 py-0.5 leading-none pointer-events-none"
                        style={{ left: `calc(${phaseBadgeLeftPct}% + 3px)`, top: '50%', transform: 'translateY(-50%)', zIndex: 4 }}
                      >
                        {project.phase.replace('phase_', 'P')}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Create project dialog */}
      {newProjectDate && (
        <Dialog open={!!newProjectDate} onOpenChange={() => setNewProjectDate(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New Project, {format(newProjectDate, 'MMM d, yyyy')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Project Name</Label>
                <Input
                  value={newProjectName}
                  onChange={e => setNewProjectName(e.target.value)}
                  placeholder="Project name..."
                  autoFocus
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setNewProjectDate(null)}>Cancel</Button>
                <Button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || creating}
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  {creating ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}