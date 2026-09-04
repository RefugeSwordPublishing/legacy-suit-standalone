import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { canViewAllProjects, canManageProjects, canAddMaterials, isClient } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { FolderKanban, Package, ListTodo, AlertTriangle, Plus, ChevronDown, CalendarCheck, ShieldCheck, CalendarX } from 'lucide-react';
import StatsBar from '@/components/dashboard/StatsBar';
import ProjectCard from '@/components/dashboard/ProjectCard';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog';
import QuickMaterialRequestDialog from '@/components/materials/QuickMaterialRequestDialog';
import ClockWidget from '@/components/timeclock/ClockWidget';
import PendingSchedulePanel from '@/components/dashboard/PendingSchedulePanel';
import SetupChecklist from '@/components/onboarding/SetupChecklist';
import { format } from 'date-fns';

export default function Dashboard() {
  const [showNewProject, setShowNewProject] = useState(false);
  const [showMaterialRequest, setShowMaterialRequest] = useState(false);
  const [showPlanning, setShowPlanning] = useState(false);
  const [showActive, setShowActive] = useState(true);
  const [showCompleted, setShowCompleted] = useState(false);
  const [showPendingSchedule, setShowPendingSchedule] = useState(false);
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();

  const { data: allProjects = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
    enabled: !!currentUser,
  });

  const { data: materials = [] } = useQuery({
    queryKey: ['materials'],
    queryFn: () => base44.entities.Material.list(),
    enabled: !!currentUser,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
    enabled: !!currentUser,
  });

  const { data: clientRequests = [] } = useQuery({
    queryKey: ['client-requests'],
    queryFn: () => base44.entities.ClientRequest.list(),
    enabled: !!currentUser,
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['time-entries-all'],
    queryFn: () => base44.entities.TimeEntry.list(),
    enabled: !!currentUser,
  });

  // Compute hours logged per project, split by role
  const hoursLoggedByProject = {};       // total crew hours
  const managerHoursByProject = {};      // site_manager hours
  timeEntries.forEach(entry => {
    if (entry.project_id && entry.duration_minutes) {
      if (entry.user_role === 'site_manager') {
        managerHoursByProject[entry.project_id] = (managerHoursByProject[entry.project_id] || 0) + entry.duration_minutes;
      } else {
        hoursLoggedByProject[entry.project_id] = (hoursLoggedByProject[entry.project_id] || 0) + entry.duration_minutes;
      }
    }
  });

  const isHighRole = currentUser?.role === 'owner' || currentUser?.role === 'coo' || currentUser?.role === 'admin';

  const { data: phaseApprovals = [] } = useQuery({
    queryKey: ['phase-approvals-all'],
    queryFn: () => base44.entities.PhaseApprovalRequest.filter({ status: 'pending' }),
    enabled: isHighRole,
  });

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const { data: todaySchedule = [] } = useQuery({
    queryKey: ['crew-schedule-today', currentUser?.id],
    queryFn: () => base44.entities.CrewScheduleEntry.filter({ user_id: currentUser.id, scheduled_date: todayStr }),
    enabled: !!currentUser?.id,
  });

  // Filter projects based on role
  const projects = canViewAllProjects(currentUser)
    ? allProjects
    : allProjects.filter(p => (currentUser?.assigned_project_ids || []).includes(p.id));

  const visibleProjectIds = new Set(projects.map(p => p.id));
  const visibleMaterials = materials.filter(m => visibleProjectIds.has(m.project_id));
  const visibleTasks = tasks.filter(t => visibleProjectIds.has(t.project_id));

  const pendingPhaseApprovals = phaseApprovals.length;
  const activeProjects = projects.filter(p => p.status === 'active').length;
  const neededMaterials = visibleMaterials.filter(m => m.status === 'needed').length;
  const urgentTasks = visibleTasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;
  const newRequests = clientRequests.filter(r => r.status === 'open').length;

  // Projects needing a schedule (no start date, not completed)
  const pendingScheduleProjects = allProjects.filter(p => !p.start_date && p.status !== 'completed');
  const pendingScheduleCount = pendingScheduleProjects.length;

  // My tasks = assigned to me, not completed
  const myName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email;
  const myPendingTasks = visibleTasks.filter(t =>
    t.status !== 'completed' && (t.assigned_to === myName || t.assigned_to === currentUser?.email)
  ).length;

  const isCrewOrEmployee = currentUser?.role === 'crew_member' || currentUser?.role === 'employee';

  const { data: todayGoals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['daily-goals-today', currentUser?.id, todayStr],
    queryFn: () => base44.entities.DailyGoal.filter({ user_id: currentUser.id, scheduled_date: todayStr }),
    enabled: !!currentUser?.id && isCrewOrEmployee,
  });

  const isCrewMember = currentUser?.role === 'crew_member';

  const stats = isHighRole
    ? [
        { label: 'Pending Schedule', value: pendingScheduleCount, icon: CalendarX, bgColor: 'bg-orange-50', iconColor: 'text-orange-500', onClick: () => setShowPendingSchedule(true) },
        { label: 'Phase Approvals', value: pendingPhaseApprovals, icon: ShieldCheck, bgColor: 'bg-violet-50', iconColor: 'text-violet-600', href: '/phase-approvals' },
        { label: 'New Requests', value: newRequests, icon: AlertTriangle, bgColor: 'bg-red-50', iconColor: 'text-red-600' },
        { label: 'Materials Needed', value: neededMaterials, icon: Package, bgColor: 'bg-amber-50', iconColor: 'text-amber-600' },
      ]
    : isCrewMember
    ? [
        { label: 'My Open Tasks', value: myPendingTasks, icon: ListTodo, bgColor: 'bg-blue-50', iconColor: 'text-blue-600', href: '/tasks?view=mine' },
        { label: 'Urgent Items', value: urgentTasks, icon: AlertTriangle, bgColor: 'bg-red-50', iconColor: 'text-red-600' },
      ]
    : [
        { label: 'Active Projects', value: activeProjects, icon: FolderKanban, bgColor: 'bg-primary/10', iconColor: 'text-primary' },
        { label: 'Materials Needed', value: neededMaterials, icon: Package, bgColor: 'bg-amber-50', iconColor: 'text-amber-600' },
        { label: 'My Open Tasks', value: myPendingTasks, icon: ListTodo, bgColor: 'bg-blue-50', iconColor: 'text-blue-600', href: '/tasks?view=mine' },
        { label: 'Urgent Items', value: urgentTasks, icon: AlertTriangle, bgColor: 'bg-red-50', iconColor: 'text-red-600' },
      ];

  // Incomplete tasks and needed materials per project
  const tasksByProject = {};
  visibleTasks.filter(t => t.status !== 'completed').forEach(t => {
    tasksByProject[t.project_id] = (tasksByProject[t.project_id] || 0) + 1;
  });
  const matsByProject = {};
  visibleMaterials.filter(m => m.status === 'needed' || m.status === 'in_cart').forEach(m => {
    matsByProject[m.project_id] = (matsByProject[m.project_id] || 0) + 1;
  });

  const toggleGoalTask = async (goal, taskIdx) => {
    const newTitles = [...(goal.task_titles || [])];
    // Track completed task indices via a separate completed_task_indices array, or use status
    // Simple approach: mark whole goal completed when all tasks done, but we want per-task.
    // Store completed indices in a 'completed_task_indices', but entity doesn't have that field.
    // Instead toggle the whole goal status when tapped (since goals here map 1:1 to a goal entry).
    const newStatus = goal.status === 'completed' ? 'active' : 'completed';
    await base44.entities.DailyGoal.update(goal.id, { status: newStatus });
    queryClient.invalidateQueries({ queryKey: ['daily-goals-today', currentUser?.id, todayStr] });
  };

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['materials'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
  };

  const canCreate = canManageProjects(currentUser);
  const canRequestMaterials = canAddMaterials(currentUser);

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {canViewAllProjects(currentUser) ? 'Overview of all job sites' : 'Your assigned projects'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {canRequestMaterials && (
            <Button
              variant="outline"
              onClick={() => setShowMaterialRequest(true)}
              className="flex-1 md:flex-none px-4 py-2 text-sm border-accent text-accent hover:bg-accent/10 hover:text-accent"
            >
              <Package className="w-4 h-4 mr-2" /> Material Request
            </Button>
          )}
          {canCreate && (
            <Button onClick={() => setShowNewProject(true)} className="flex-1 md:flex-none bg-accent text-accent-foreground hover:bg-accent/90 px-4 py-2 text-sm">
              <Plus className="w-4 h-4 mr-2" /> New Project
            </Button>
          )}
        </div>
      </div>

      <SetupChecklist />

      <StatsBar stats={stats} />

      {/* Time Clock Widget */}
      {!isClient(currentUser) && (
        <ClockWidget projects={allProjects.filter(p => p.status === 'active')} />
      )}

      {/* Today's Schedule */}
      {todaySchedule.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <CalendarCheck className="w-4 h-4 text-accent" />
            <h2 className="text-sm font-semibold text-foreground">Today's Schedule</h2>
            <span className="text-xs text-muted-foreground ml-1">{format(new Date(), 'EEEE, MMM d')}</span>
          </div>
          <div className="flex flex-col gap-3">
            {todaySchedule.map(entry => {
              const proj = allProjects.find(p => p.id === entry.project_id);
              const projectGoals = isCrewOrEmployee
                ? todayGoals.filter(g => g.project_id === entry.project_id)
                : [];
              return (
                <div key={entry.id}>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium text-white"
                    style={{ backgroundColor: proj?.color || '#3B82F6' }}
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    {proj?.name || 'Unknown Project'}
                    {proj?.phase && (
                      <span className="text-[10px] font-bold bg-black/20 rounded px-1.5 py-0.5 leading-none">
                        {proj.phase.replace('phase_', 'P')}
                      </span>
                    )}
                    {entry.notes && <span className="opacity-75 text-xs">· {entry.notes}</span>}
                  </div>
                  {projectGoals.length > 0 && (
                    <ul className="mt-2 ml-1 space-y-1.5">
                      {projectGoals.map(goal =>
                        (goal.task_titles || []).map((title, idx) => {
                          const done = goal.status === 'completed';
                          return (
                            <li key={`${goal.id}-${idx}`} className="flex items-center gap-2">
                              <button
                                onClick={() => toggleGoalTask(goal, idx)}
                                className="flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors"
                                style={{
                                  borderColor: 'hsl(var(--primary))',
                                  backgroundColor: done ? 'hsl(var(--primary))' : 'transparent',
                                }}
                                aria-label={done ? 'Mark incomplete' : 'Mark complete'}
                              >
                                {done && (
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L3.5 6.5L9 1" stroke="#F5F2EA" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </button>
                              <span
                                className="text-xs font-highway"
                                style={{
                                  color: done ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))',
                                  textDecoration: done ? 'line-through' : 'none',
                                }}
                              >
                                {title}
                              </span>
                            </li>
                          );
                        })
                      )}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {todaySchedule.length === 0 && currentUser && (
        <div className="bg-muted/40 border border-border rounded-xl p-4 flex items-center gap-3">
          <CalendarCheck className="w-4 h-4 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground">No schedule for today</p>
            <p className="text-xs text-muted-foreground">{format(new Date(), 'EEEE, MMM d')}</p>
          </div>
        </div>
      )}

      {loadingProjects ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <div className="text-center py-20">
          <FolderKanban className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">No projects yet</h3>
          <p className="text-sm text-muted-foreground mt-1">
            {canCreate ? 'Create your first project to get started' : 'No projects have been assigned to you yet'}
          </p>
          {canCreate && (
            <Button onClick={() => setShowNewProject(true)} className="mt-4 bg-accent text-accent-foreground hover:bg-accent/90">
              <Plus className="w-4 h-4 mr-2" /> Create Project
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Planning, high roles only */}
          {isHighRole && (() => {
            const planningProjects = projects.filter(p => p.status === 'planning');
            return planningProjects.length > 0 ? (
              <div>
                <button
                  onClick={() => setShowPlanning(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent transition-colors mb-3 w-full"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showPlanning ? '' : '-rotate-90'}`} />
                  Planning ({planningProjects.length})
                </button>
                {showPlanning && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {planningProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        taskCount={tasksByProject[project.id] || 0}
                        materialCount={matsByProject[project.id] || 0}
                        hoursLogged={(hoursLoggedByProject[project.id] || 0) / 60}
                        managerHoursLogged={(managerHoursByProject[project.id] || 0) / 60}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null;
          })()}

          {/* Active */}
          {(() => {
            const activeProjs = projects.filter(p => p.status === 'active');
            return activeProjs.length > 0 ? (
              <div>
                <button
                  onClick={() => setShowActive(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-accent transition-colors mb-3 w-full"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showActive ? '' : '-rotate-90'}`} />
                  Active ({activeProjs.length})
                </button>
                {showActive && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeProjs.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        taskCount={tasksByProject[project.id] || 0}
                        materialCount={matsByProject[project.id] || 0}
                        hoursLogged={(hoursLoggedByProject[project.id] || 0) / 60}
                        managerHoursLogged={(managerHoursByProject[project.id] || 0) / 60}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null;
          })()}

          {/* Completed */}
          {(() => {
            const completedProjs = projects.filter(p => p.status === 'completed');
            return completedProjs.length > 0 ? (
              <div>
                <button
                  onClick={() => setShowCompleted(v => !v)}
                  className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors mb-3 w-full"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${showCompleted ? '' : '-rotate-90'}`} />
                  Completed ({completedProjs.length})
                </button>
                {showCompleted && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {completedProjs.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        taskCount={tasksByProject[project.id] || 0}
                        materialCount={matsByProject[project.id] || 0}
                        hoursLogged={(hoursLoggedByProject[project.id] || 0) / 60}
                        managerHoursLogged={(managerHoursByProject[project.id] || 0) / 60}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : null;
          })()}
        </div>
      )}

      {canCreate && (
        <ProjectFormDialog
          open={showNewProject}
          onOpenChange={setShowNewProject}
          onSaved={refreshAll}
        />
      )}
      {canRequestMaterials && (
        <QuickMaterialRequestDialog
          open={showMaterialRequest}
          onOpenChange={setShowMaterialRequest}
          projects={projects}
          onSaved={refreshAll}
        />
      )}

      {isHighRole && (
        <PendingSchedulePanel
          open={showPendingSchedule}
          onOpenChange={setShowPendingSchedule}
          projects={pendingScheduleProjects}
          onSaved={() => { refreshAll(); setShowPendingSchedule(false); }}
        />
      )}
    </div>
  );
}