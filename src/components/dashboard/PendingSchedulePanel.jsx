import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, CalendarX, Pencil } from 'lucide-react';
import { useState } from 'react';
import ProjectFormDialog from '@/components/projects/ProjectFormDialog';

const statusConfig = {
  planning: { label: 'Planning', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  on_hold: { label: 'On Hold', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  completed: { label: 'Completed', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export default function PendingSchedulePanel({ open, onOpenChange, projects, onSaved }) {
  const [editProject, setEditProject] = useState(null);

  const handleSaved = () => {
    setEditProject(null);
    onSaved();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <CalendarX className="w-5 h-5 text-orange-500" />
              Pending Schedule ({projects.length})
            </SheetTitle>
            <p className="text-sm text-muted-foreground">
              These projects have no start date set. Open each to add scheduling details.
            </p>
          </SheetHeader>

          <div className="space-y-3">
            {projects.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                All projects are scheduled!
              </div>
            ) : (
              projects.map(project => {
                const status = statusConfig[project.status] || statusConfig.planning;
                return (
                  <div
                    key={project.id}
                    className="border border-border rounded-xl p-4 bg-card space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{project.name}</p>
                        {project.client_name && (
                          <p className="text-xs text-muted-foreground">{project.client_name}</p>
                        )}
                      </div>
                      <Badge variant="outline" className={`${status.className} shrink-0 text-xs`}>
                        {status.label}
                      </Badge>
                    </div>
                    {project.address && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate">{project.address}</span>
                      </div>
                    )}
                    {project.duration_value && (
                      <p className="text-xs text-muted-foreground">
                        Timeframe: {project.duration_value} {project.duration_unit}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full mt-1"
                      onClick={() => setEditProject(project)}
                    >
                      <Pencil className="w-3.5 h-3.5 mr-1.5" />
                      Set Schedule
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {editProject && (
        <ProjectFormDialog
          open={!!editProject}
          onOpenChange={open => { if (!open) setEditProject(null); }}
          editProject={editProject}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}