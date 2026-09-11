import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Grid3x3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import WeeklyScheduleView from '@/components/schedules/WeeklyScheduleView';
import MonthlyScheduleView from '@/components/schedules/MonthlyScheduleView';
import ProjectInfoPopover from '@/components/schedules/ProjectInfoPopover';
import ProjectEditDialog from '@/components/schedules/ProjectEditDialog';

export default function Schedules() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState('monthly');
  const [editingProject, setEditingProject] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const isHighRole = currentUser?.role === 'owner' || currentUser?.role === 'coo' || currentUser?.role === 'admin';

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list('-created_date'),
  });

  const { data: tasks = [], refetch: refetchTasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => base44.entities.Task.list(),
  });

  const subContractorTasks = tasks
    .filter(t => t.is_sub_contractor_task && t.eta_start && t.eta_end)
    .map(t => {
      const proj = projects.find(p => p.id === t.project_id);
      return { ...t, project_name: proj?.name || '' };
    });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const projectsWithStats = projects.map(p => {
    const projectTasks = tasks.filter(t => t.project_id === p.id);
    const completedTasks = projectTasks.filter(t => t.status === 'completed').length;
    const totalTasks = projectTasks.length;
    const percentComplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    
    const siteManager = p.site_manager_id ? users.find(u => u.id === p.site_manager_id) : null;
    const siteManagerName = siteManager ? [siteManager.first_name, siteManager.last_name].filter(Boolean).join(' ') : 'Unassigned';

    return {
      ...p,
      percentComplete,
      siteManagerName,
    };
  });

  if (!isHighRole) {
    return (
      <div className="p-6 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-muted-foreground">You don't have access to the schedules page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">Project Schedules</h1>
          <p className="text-sm text-muted-foreground mt-1">View project timelines and progress</p>
        </div>
        <div className="flex gap-2">
          <Button variant="default" size="sm" className="bg-accent text-accent-foreground">
            <Grid3x3 className="w-4 h-4 mr-1" /> Monthly
          </Button>
        </div>
      </div>

      <MonthlyScheduleView 
        projects={projectsWithStats}
        subContractorTasks={subContractorTasks}
        onEditColor={project => setEditingProject(project)}
        onSelectItem={item => {
          if (item?._isSubTask) setSelectedItem(item);
          else setEditingProject(item);
        }}
      />

      <ProjectInfoPopover
        project={selectedItem}
        open={!!selectedItem}
        onOpenChange={v => !v && setSelectedItem(null)}
        onDeleted={() => { setSelectedItem(null); refetchTasks(); }}
      />

      <ProjectEditDialog
        project={editingProject}
        open={!!editingProject}
        onOpenChange={v => !v && setEditingProject(null)}
        onSaved={() => {
          setEditingProject(null);
          queryClient.invalidateQueries({ queryKey: ['projects'] });
        }}
      />
    </div>
  );
}