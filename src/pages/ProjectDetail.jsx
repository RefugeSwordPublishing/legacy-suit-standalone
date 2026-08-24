import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { useCurrentUser } from '@/lib/UserContext';
import { canManageProjects, canAccessProject } from '@/lib/permissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, MapPin, Calendar, DollarSign, Pencil, Trash2, Lock } from 'lucide-react';
import PhaseSelector from '@/components/projects/PhaseSelector';
import PhaseApprovalBanner from '@/components/projects/PhaseApprovalBanner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { format } from 'date-fns';
import MaterialsList from '@/components/projects/MaterialsList';
import TasksList from '@/components/projects/TasksList';
import ProjectFilesList from '@/components/projects/ProjectFilesList';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog';
import ProjectHoursBar from '@/components/projects/ProjectHoursBar';
import ProjectFinancials from '@/components/project-detail/ProjectFinancials';

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  on_hold: { label: 'On Hold', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function ProjectDetail() {
  const pathParts = window.location.pathname.split('/');
  const projectId = pathParts[pathParts.length - 1];
  const navigate = useNavigate();
  const { currentUser } = useCurrentUser();

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const queryClient = useQueryClient();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const project = projects.find(p => p.id === projectId);

  const { data: materials = [] } = useQuery({
    queryKey: ['materials', projectId],
    queryFn: () => base44.entities.Material.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks', projectId],
    queryFn: () => base44.entities.Task.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const { data: projectFiles = [] } = useQuery({
    queryKey: ['project_files', projectId],
    queryFn: () => base44.entities.ProjectFile.filter({ project_id: projectId }),
    enabled: !!projectId,
  });

  const refreshMaterials = () => queryClient.invalidateQueries({ queryKey: ['materials', projectId] });
  const refreshTasks = () => queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
  const refreshFiles = () => queryClient.invalidateQueries({ queryKey: ['project_files', projectId] });

  const handleDelete = async () => {
    try {
      // Child records cascade (tasks, materials, files, schedule, goals, requests) or unlink
      // (estimates, invoices, expenses, change orders) via the FK on-delete rules, so deleting the
      // project row is enough. Previously this failed silently when the project had any such data.
      await base44.entities.Project.delete(projectId);
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      navigate('/');
    } catch (e) {
      alert(`Could not delete this project: ${e?.message || 'please try again.'}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Link to="/" className="text-accent hover:underline text-sm mt-2 inline-block">Back to Dashboard</Link>
      </div>
    );
  }

  // Access check for restricted roles
  if (!canAccessProject(currentUser, projectId)) {
    return (
      <div className="p-8 text-center">
        <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold">Access Restricted</h3>
        <p className="text-sm text-muted-foreground mt-1">You don't have access to this project.</p>
        <Link to="/" className="text-accent hover:underline text-sm mt-2 inline-block">Back to Dashboard</Link>
      </div>
    );
  }

  const canEdit = canManageProjects(currentUser);
  const canChangePhase = currentUser?.role === 'owner' || currentUser?.role === 'coo' || currentUser?.role === 'admin';
  const status = statusConfig[project.status] || statusConfig.planning;

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back to Dashboard
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-foreground">{project.name}</h1>
              <Badge variant="outline" className={`${status.className} text-xs`}>{status.label}</Badge>
            </div>
            {project.client_name && <p className="text-muted-foreground mt-1">{project.client_name}</p>}

            <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-muted-foreground">
              {project.address && (
                <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5" /> {project.address}</span>
              )}
              {project.start_date && (
                <span className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> {format(new Date(project.start_date), 'MMM d, yyyy')}</span>
              )}
              {project.target_end_date && (
                <span>→ {format(new Date(project.target_end_date), 'MMM d, yyyy')}</span>
              )}
              {project.budget && (
                <span className="flex items-center gap-1.5"><DollarSign className="w-3.5 h-3.5" /> {Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 2 })}</span>
              )}
            </div>

            {project.notes && (
              <p className="text-sm text-muted-foreground mt-3 bg-muted/50 rounded-lg p-3">{project.notes}</p>
            )}
            <div className="mt-3">
              <ProjectHoursBar projectId={projectId} budgetHours={project.budget_hours} project={project} />
            </div>
            <div className="mt-3 space-y-2">
              {canChangePhase && (
                <PhaseSelector project={project} canEdit={canChangePhase} />
              )}
              <PhaseApprovalBanner
                project={project}
                tasks={tasks}
                onProjectUpdated={() => {
                  queryClient.invalidateQueries({ queryKey: ['projects'] });
                  queryClient.invalidateQueries({ queryKey: ['tasks', projectId] });
                }}
              />
            </div>
          </div>

          {canEdit && (
            <div className="flex gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
                <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 border-b border-border">
        {['overview', 'financials'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <>
          <ProjectFilesList
            files={projectFiles}
            projectId={projectId}
            projectStatus={project.status}
            projectUpdatedDate={project.updated_date}
            onRefresh={refreshFiles}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <TasksList tasks={tasks} projectId={projectId} projectName={project.name} project={project} onRefresh={refreshTasks} />
            <MaterialsList materials={materials} projectId={projectId} projectName={project.name} onRefresh={refreshMaterials} />
          </div>
        </>
      )}

      {activeTab === 'financials' && (
        <ProjectFinancials project={project} projectId={projectId} />
      )}

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete project?</AlertDialogTitle>
            <AlertDialogDescription>This permanently deletes the project and its tasks, materials, schedule, and files. Estimates, invoices, and expenses are kept but unlinked from the project. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {canEdit && (
        <ProjectFormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          editProject={project}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['projects'] })}
        />
      )}
    </div>
  );
}