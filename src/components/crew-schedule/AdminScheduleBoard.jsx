import { useState, useEffect } from 'react';
import { format, addDays, startOfWeek, isToday } from 'date-fns';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X, Target } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

import { ROLE_LABELS } from '@/lib/permissions';
import { useCurrentUser } from '@/lib/UserContext';
import SetDailyGoalDialog from './SetDailyGoalDialog';
import ProjectQuickPicker from './ProjectQuickPicker';

const ROLE_COLORS = {
  owner: 'bg-primary/10 text-primary',
  coo: 'bg-purple-100 text-purple-700',
  admin: 'bg-red-100 text-red-700',
  site_manager: 'bg-blue-100 text-blue-700',
  crew_member: 'bg-slate-100 text-slate-600',
  client: 'bg-green-100 text-green-700',
};

const SCHEDULABLE_ROLES = ['owner', 'admin', 'coo', 'site_manager', 'crew_member'];
const USER_COL_WIDTH_DESKTOP = 150;
const USER_COL_WIDTH_MOBILE = 100;
const HIGH_ROLES = ['owner', 'coo', 'admin'];

export default function AdminScheduleBoard({ users, projects, scheduleEntries, onRefresh }) {
  const { currentUser } = useCurrentUser();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [goalDialog, setGoalDialog] = useState(null);
  const [isMobile, setIsMobile] = useState(false);
  const [viewMode, setViewMode] = useState('week'); // 'week' | '3day'
  const [mobileDayOffset, setMobileDayOffset] = useState(0); // offset from weekStart for 3-day mobile view
  const { toast } = useToast();

  const canSetGoals = HIGH_ROLES.includes(currentUser?.role);
  const queryClient = useQueryClient();

  // Detect mobile
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const activeProjects = projects.filter(p => p.status !== 'completed');
  const schedulableUsers = users.filter(u => SCHEDULABLE_ROLES.includes(u.role));

  // Determine which days to show
  const allWeekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const use3Day = isMobile || viewMode === '3day';
  const days = use3Day
    ? Array.from({ length: 3 }, (_, i) => addDays(weekStart, mobileDayOffset + i))
    : allWeekDays;

  const numDays = days.length;
  const userColWidth = isMobile ? USER_COL_WIDTH_MOBILE : USER_COL_WIDTH_DESKTOP;
  const dayColStyle = isMobile
    ? `calc((100vw - ${userColWidth}px) / 3)`
    : `minmax(120px, 1fr)`;

  const getDisplayName = (user) => {
    if (isMobile) return user.first_name || ([user.full_name || ''].join(' ').split(' ')[0]) || user.email || '';
    return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
  };

  const gridTemplate = `${userColWidth}px repeat(${numDays}, ${dayColStyle})`;

  const { data: approvedTimeOff = [] } = useQuery({
    queryKey: ['time-off-approved'],
    queryFn: () => base44.entities.TimeOffRequest.filter({ status: 'approved' }),
  });

  const isTimeOff = (profile, date) => {
    const uid = profile.user_id || profile.id;
    const dateStr = format(date, 'yyyy-MM-dd');
    return approvedTimeOff.some(r => r.user_id === uid && dateStr >= r.start_date && dateStr <= r.end_date);
  };

  const getEntriesForCell = (profile, date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const uid = profile.user_id || profile.id;
    return scheduleEntries.filter(e => e.user_id === uid && e.scheduled_date === dateStr);
  };

  const getProject = (projectId) => projects.find(p => p.id === projectId);

  const handleAddProject = async (user, dateStr, projectId) => {
    if (!projectId || projectId === '__none__') return;

    const uid = user.user_id || user.id;
    const blocked = approvedTimeOff.some(r => r.user_id === uid && dateStr >= r.start_date && dateStr <= r.end_date);
    if (blocked) return;

    const already = scheduleEntries.find(e => e.user_id === uid && e.scheduled_date === dateStr && e.project_id === projectId);
    if (already) return;

    try {
      await base44.entities.CrewScheduleEntry.create({
        user_id: uid,
        user_name: [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email || '',
        user_role: user.role || '',
        project_id: projectId,
        scheduled_date: dateStr,
      });
      await queryClient.invalidateQueries({ queryKey: ['crew-schedule'] });
    } catch (e) {
      // A rapid re-pick can race the cache guard; the DB unique index then rejects the duplicate.
      // That means the assignment already exists, so treat it as success rather than an error.
      const dup = e?.code === '23505' || /duplicate|unique/i.test(e?.message || '');
      if (dup) {
        await queryClient.invalidateQueries({ queryKey: ['crew-schedule'] });
      } else {
        toast({ title: 'Failed to save assignment', description: e.message, variant: 'destructive' });
      }
    }
  };

  const removeEntry = async (entryId) => {
    try {
      await base44.entities.CrewScheduleEntry.delete(entryId);
      await queryClient.invalidateQueries({ queryKey: ['crew-schedule'] });
    } catch (e) {
      toast({ title: 'Failed to remove assignment', description: e.message, variant: 'destructive' });
    }
  };

  // Navigation
  const prevPeriod = () => {
    if (use3Day) {
      const newOffset = mobileDayOffset - 1;
      if (newOffset < 0) {
        setWeekStart(d => addDays(d, -7));
        setMobileDayOffset(6);
      } else {
        setMobileDayOffset(newOffset);
      }
    } else {
      setWeekStart(d => addDays(d, -7));
    }
  };

  const nextPeriod = () => {
    if (use3Day) {
      const newOffset = mobileDayOffset + 1;
      if (newOffset > 6) {
        setWeekStart(d => addDays(d, 7));
        setMobileDayOffset(0);
      } else {
        setMobileDayOffset(newOffset);
      }
    } else {
      setWeekStart(d => addDays(d, 7));
    }
  };

  const rangeLabel = use3Day
    ? `${format(days[0], 'MMM d')} - ${format(days[days.length - 1], 'MMM d, yyyy')}`
    : `${format(weekStart, 'MMM d')} - ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`;

  return (
    <div className="flex flex-col gap-4 min-h-0">
      {/* Header: navigation + view toggle */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={prevPeriod}>
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <span className="text-sm font-semibold flex-1">{rangeLabel}</span>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={nextPeriod}>
          <ChevronRight className="w-4 h-4" />
        </Button>
        {/* View toggle, hidden on mobile (auto 3-day), shown on desktop */}
        <div className="hidden md:flex border border-border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode('week')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode('3day')}
            className={`px-3 py-1.5 text-xs font-medium transition-colors border-l border-border ${viewMode === '3day' ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:bg-muted'}`}
          >
            3-Day
          </button>
        </div>
      </div>

      {/* Scrollable grid (desktop) */}
      <div className="hidden md:block border border-border rounded-xl overflow-auto bg-card">
        <div style={{ minWidth: isMobile ? 'unset' : undefined }}>
          {/* Sticky header row */}
          <div
            className="sticky top-0 z-20 grid bg-muted/60 border-b border-border"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <div className="border-r border-border px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center">
              Team
            </div>
            {days.map((day, i) => {
              const today = isToday(day);
              return (
                <div key={i} className={`text-center py-2 border-r last:border-r-0 border-border ${today ? 'bg-accent/10' : ''}`}>
                  <p className={`text-[11px] font-semibold uppercase tracking-wide ${today ? 'text-accent' : 'text-muted-foreground'}`}>
                    {format(day, 'EEE')}
                  </p>
                  <p className={`text-base font-bold leading-tight ${today ? 'text-accent' : 'text-foreground'}`}>
                    {format(day, 'd')}
                  </p>
                  <p className={`text-[10px] ${today ? 'text-accent/70' : 'text-muted-foreground'}`}>
                    {format(day, 'MMM')}
                  </p>
                </div>
              );
            })}
          </div>

          {/* User rows */}
          {schedulableUsers.map((user, rowIdx) => (
            <div
              key={user.id}
              className={`grid ${rowIdx < schedulableUsers.length - 1 ? 'border-b border-border' : ''}`}
              style={{ gridTemplateColumns: gridTemplate }}
            >
              {/* User label */}
              <div className="sticky left-0 z-10 border-r border-border px-2 py-2 flex flex-col justify-center bg-muted/20" style={{ width: userColWidth }}>
                <p className="text-xs font-semibold leading-tight" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {getDisplayName(user)}
                </p>
                {!isMobile && (
                  <span className={`text-[10px] mt-0.5 font-medium px-1 py-0.5 rounded w-fit ${ROLE_COLORS[user.role] || 'bg-slate-100 text-slate-600'}`}>
                    {ROLE_LABELS[user.role] || user.role}
                  </span>
                )}
              </div>

              {/* Day cells */}
              {days.map((day, di) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const cellEntries = getEntriesForCell(user, day);
                const today = isToday(day);
                const timeOff = isTimeOff(user, day);
                const assignedProjectIds = cellEntries.map(e => e.project_id);
                // Tap-to-fill offers only ACTIVE-status projects not already on this cell.
                const availableProjects = projects.filter(p => p.status === 'active' && !assignedProjectIds.includes(p.id));

                return (
                  <div
                    key={di}
                    className={`p-1 border-r last:border-r-0 border-border overflow-hidden min-w-0 ${
                      timeOff ? 'bg-slate-100 dark:bg-slate-800/40' : today ? 'bg-accent/5' : ''
                    }`}
                    style={{ minHeight: 72 }}
                  >
                    {timeOff ? (
                      <p className="text-[10px] text-slate-400 italic px-1 pt-1 font-medium">Time Off</p>
                    ) : (
                      <>
                        {cellEntries.map(entry => {
                          const project = getProject(entry.project_id);
                          const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
                          return (
                            <div
                              key={entry.id}
                              className="group relative rounded mb-0.5 font-medium text-white leading-tight"
                              style={{
                                backgroundColor: project?.color || '#3B82F6',
                                fontSize: isMobile ? 10 : 11,
                                padding: isMobile ? '2px 6px' : '4px 6px',
                              }}
                              title={project?.name}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span className="flex-1 min-w-0" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project?.name || '?'}</span>
                                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                  {canSetGoals && (
                                    <button
                                      onClick={() => setGoalDialog({ entry, project, userName })}
                                      title="Set daily goal"
                                      className="hover:bg-white/20 rounded p-0.5"
                                    >
                                      <Target className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => removeEntry(entry.id)}
                                    className="hover:bg-white/20 rounded p-0.5"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>
                              {project?.phase && !isMobile && (
                                <span className="text-[9px] font-bold bg-black/20 rounded px-1 py-0.5 leading-none mt-0.5 inline-block">
                                  {project.phase.replace('phase_', 'P')}
                                </span>
                              )}
                            </div>
                          );
                        })}

                        {availableProjects.length > 0 && (
                          <ProjectQuickPicker
                            projects={availableProjects}
                            isMobile={isMobile}
                            onPick={(projectId) => handleAddProject(user, dateStr, projectId)}
                          />
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: one card per day, every crew member listed inside (scan a day at a glance) */}
      <div className="md:hidden space-y-3">
        {days.map((day, di) => {
          const today = isToday(day);
          const dateStr = format(day, 'yyyy-MM-dd');
          return (
            <div key={di} className={`border rounded-xl bg-card overflow-hidden ${today ? 'border-accent/40' : 'border-border'}`}>
              <div className={`px-3 py-2 border-b flex items-center gap-2 ${today ? 'bg-accent/10 border-accent/25' : 'bg-muted/40 border-border'}`}>
                <span className={`text-sm font-semibold ${today ? 'text-accent' : 'text-foreground'}`}>{format(day, 'EEEE')}</span>
                <span className="text-xs text-muted-foreground">{format(day, 'MMM d')}</span>
                {today && <span className="ml-auto text-[10px] font-semibold uppercase tracking-wide text-accent">Today</span>}
              </div>
              <div className="divide-y divide-border">
                {schedulableUsers.map(user => {
                  const cellEntries = getEntriesForCell(user, day);
                  const timeOff = isTimeOff(user, day);
                  const assignedProjectIds = cellEntries.map(e => e.project_id);
                  const availableProjects = projects.filter(p => p.status === 'active' && !assignedProjectIds.includes(p.id));
                  return (
                    <div key={user.id} className="flex items-start gap-3 px-3 py-2">
                      <div className="w-24 shrink-0 pt-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{getDisplayName(user)}</p>
                      </div>
                      <div className="flex-1 min-w-0 space-y-1">
                        {timeOff ? (
                          <p className="text-xs text-slate-400 italic py-1">Time Off</p>
                        ) : (
                          <>
                            {cellEntries.map(entry => {
                              const project = getProject(entry.project_id);
                              const userName = [user.first_name, user.last_name].filter(Boolean).join(' ') || user.full_name || user.email;
                              return (
                                <div
                                  key={entry.id}
                                  className="flex items-center justify-between gap-2 rounded px-2 py-1.5 text-white font-medium text-xs"
                                  style={{ backgroundColor: project?.color || '#3B82F6' }}
                                >
                                  <span className="flex-1 min-w-0 truncate">{project?.name || '?'}</span>
                                  <div className="flex items-center gap-1 shrink-0">
                                    {canSetGoals && (
                                      <button onClick={() => setGoalDialog({ entry, project, userName })} title="Set daily goal" className="hover:bg-white/20 rounded p-0.5">
                                        <Target className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button onClick={() => removeEntry(entry.id)} className="hover:bg-white/20 rounded p-0.5">
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                            {availableProjects.length > 0 ? (
                              <ProjectQuickPicker
                                projects={availableProjects}
                                isMobile={true}
                                onPick={(projectId) => handleAddProject(user, dateStr, projectId)}
                              />
                            ) : cellEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-1">—</p>
                            ) : null}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {goalDialog && (
        <SetDailyGoalDialog
          open={!!goalDialog}
          onOpenChange={(o) => { if (!o) setGoalDialog(null); }}
          entry={goalDialog.entry}
          project={goalDialog.project}
          userName={goalDialog.userName}
        />
      )}
    </div>
  );
}