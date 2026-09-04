import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Button } from '@/components/ui/button';
import { Plus, ChevronDown } from 'lucide-react';
import ProjectCard from '@/components/dashboard/ProjectCard';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog';
import ListToolbar from '@/components/shared/ListToolbar';
import { naturalCompare, byDateDesc } from '@/lib/naturalSort';

const SORT_OPTIONS = [
  { value: 'name', label: 'Name (A to Z, by number)' },
  { value: 'client', label: 'Client' },
  { value: 'started', label: 'Date started (newest)' },
  { value: 'recent', label: 'Recently added' },
];

const HIGH_ROLES = ['owner', 'coo', 'admin'];

function ProjectSection({ title, projects, tasksByProject, matsByProject, hoursByProject, mgHoursByProject, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  if (projects.length === 0) return null;
  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-muted-foreground transition-colors mb-3"
      >
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? '' : '-rotate-90'}`} />
        {title} ({projects.length})
      </button>
      {open && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(project => (
            <ProjectCard
              key={project.id}
              project={project}
              taskCount={tasksByProject[project.id] || 0}
              materialCount={matsByProject[project.id] || 0}
              hoursLogged={hoursByProject[project.id] || 0}
              managerHoursLogged={mgHoursByProject[project.id] || 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Projects() {
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('name');
  const queryClient = useQueryClient();

  const sortFn = (a, b) => {
    if (sort === 'client') return naturalCompare(a.client_name, b.client_name) || naturalCompare(a.name, b.name);
    if (sort === 'started') return byDateDesc('start_date')(a, b);
    if (sort === 'recent') return byDateDesc('created_date')(a, b);
    return naturalCompare(a.name, b.name);
  };
  const { currentUser } = useCurrentUser();

  const role = currentUser?.role;
  const isHighRole = HIGH_ROLES.includes(role);
  const isSiteManager = role === 'site_manager';
  // Site managers and high roles can see all projects
  const canSeeAll = isHighRole || isSiteManager;

  const { data: allProjects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
    enabled: !!currentUser,
  });
  const { data: tasks = [] } = useQuery({ queryKey: ['tasks'], queryFn: () => base44.entities.Task.list(), enabled: !!currentUser });
  const { data: materials = [] } = useQuery({ queryKey: ['materials'], queryFn: () => base44.entities.Material.list(), enabled: !!currentUser });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 2000), enabled: !!currentUser });

  const tasksByProject = {};
  tasks.forEach(t => { tasksByProject[t.project_id] = (tasksByProject[t.project_id] || 0) + 1; });
  const matsByProject = {};
  materials.forEach(m => { matsByProject[m.project_id] = (matsByProject[m.project_id] || 0) + 1; });

  const CREW_ROLES = ['crew_member'];
  const MGR_ROLES = ['owner', 'coo', 'admin', 'site_manager'];
  const hoursByProject = {};
  const mgHoursByProject = {};
  timeEntries.forEach(e => {
    if (!e.duration_minutes) return;
    const h = e.duration_minutes / 60;
    if (MGR_ROLES.includes(e.user_role)) {
      mgHoursByProject[e.project_id] = (mgHoursByProject[e.project_id] || 0) + h;
    } else {
      hoursByProject[e.project_id] = (hoursByProject[e.project_id] || 0) + h;
    }
  });

  const assignedIds = new Set(currentUser?.assigned_project_ids || []);

  // Who can see what
  const baseVisible = canSeeAll ? allProjects : allProjects.filter(p => assignedIds.has(p.id));

  const matchSearch = (p) =>
    !search ||
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.client_name?.toLowerCase().includes(search.toLowerCase());

  // Planning, high roles only, never shown to site managers or crew
  const planningProjects = isHighRole
    ? baseVisible.filter(p => p.status === 'planning' && matchSearch(p)).sort(sortFn)
    : [];

  // Non-planning, non-completed
  const nonPlanningActive = baseVisible.filter(
    p => p.status !== 'planning' && p.status !== 'completed' && matchSearch(p)
  ).sort(sortFn);

  // Completed
  const completedProjects = baseVisible.filter(p => p.status === 'completed' && matchSearch(p)).sort(sortFn);

  // Site managers: split non-planning-active into assigned vs other
  const myActive = isSiteManager
    ? nonPlanningActive.filter(p => assignedIds.has(p.id))
    : nonPlanningActive;
  const otherActive = isSiteManager ? nonPlanningActive.filter(p => !assignedIds.has(p.id)) : [];

  const myCompleted = isSiteManager ? completedProjects.filter(p => assignedIds.has(p.id)) : completedProjects;
  const otherCompleted = isSiteManager ? completedProjects.filter(p => !assignedIds.has(p.id)) : [];

  const otherProjects = [...otherActive, ...otherCompleted];

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">My Projects</h1>
        <Button onClick={() => setShowForm(true)} className="bg-accent text-accent-foreground hover:bg-accent/90">
          <Plus className="w-4 h-4 mr-2" /> New Project
        </Button>
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search projects by name or client..."
        sort={sort}
        onSort={setSort}
        sortOptions={SORT_OPTIONS}
      />

      <div className="space-y-8">
        {/* Planning, high roles only */}
        {isHighRole && planningProjects.length > 0 && (
          <ProjectSection
            title="Planning"
            projects={planningProjects}
            tasksByProject={tasksByProject}
            matsByProject={matsByProject}
            hoursByProject={hoursByProject}
            mgHoursByProject={mgHoursByProject}
            defaultOpen={true}
          />
        )}

        {/* My / Active projects */}
        <ProjectSection
          title={isSiteManager ? 'My Projects' : 'Active Projects'}
          projects={isSiteManager ? myActive : nonPlanningActive}
          tasksByProject={tasksByProject}
          matsByProject={matsByProject}
          hoursByProject={hoursByProject}
          mgHoursByProject={mgHoursByProject}
          defaultOpen={true}
        />

        {/* Completed (assigned only for site managers) */}
        {myCompleted.length > 0 && (
          <ProjectSection
            title="Completed"
            projects={myCompleted}
            tasksByProject={tasksByProject}
            matsByProject={matsByProject}
            hoursByProject={hoursByProject}
            mgHoursByProject={mgHoursByProject}
            defaultOpen={false}
          />
        )}

        {/* Other Projects, site managers only, collapsed by default */}
        {isSiteManager && otherProjects.length > 0 && (
          <ProjectSection
            title="Other Projects"
            projects={otherProjects}
            tasksByProject={tasksByProject}
            matsByProject={matsByProject}
            hoursByProject={hoursByProject}
            mgHoursByProject={mgHoursByProject}
            defaultOpen={false}
          />
        )}

        {planningProjects.length + (isSiteManager ? myActive : nonPlanningActive).length + myCompleted.length + otherProjects.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-12">No projects found.</p>
        )}
      </div>

      <ProjectFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}
      />
    </div>
  );
}