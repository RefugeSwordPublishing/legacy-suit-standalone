import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MapPin, User, CheckCircle, Wrench, Calendar, Trash2, AlertTriangle } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { base44 } from '@/api/base44Client';

const PHASE_LABELS = {
  phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3',
  phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6',
};

const STATUS_COLORS = {
  planning: 'bg-muted text-muted-foreground',
  active: 'bg-green-100 text-green-700',
  on_hold: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-blue-100 text-blue-700',
};

export default function ProjectInfoPopover({ project, open, onOpenChange, onDeleted }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [bidExists, setBidExists] = useState(null); // null = not checked yet

  if (!project) return null;

  const isSubTask = !!project._isSubTask;

  const handleConfirm = async () => {
    // If there's a bid_request_id, verify the bid actually still exists
    if (project.bid_request_id && bidExists === null) {
      try {
        await base44.entities.BidRequest.get(project.bid_request_id);
        setBidExists(true);
      } catch {
        setBidExists(false);
      }
    }
    setConfirming(true);
  };

  const hasBid = project.bid_request_id && bidExists === true;

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.Task.delete(project.id);
    setDeleting(false);
    setConfirming(false);
    onOpenChange(false);
    onDeleted && onDeleted();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setConfirming(false); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 leading-snug">
            {isSubTask
              ? <><Wrench className="w-4 h-4 text-amber-700 shrink-0" /> {project.title}</>
              : project.name}
          </DialogTitle>
          {isSubTask && (
            <p className="text-sm text-muted-foreground">{project.project_name}</p>
          )}
        </DialogHeader>

        <div className="space-y-3 text-sm">
          {/* Project bar info */}
          {!isSubTask && (
            <>
              {project.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>{project.address}</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <span>Site Manager: <strong>{project.siteManagerName || 'Unassigned'}</strong></span>
              </div>

              {project.status && (
                <div className="flex items-center gap-2">
                  <Badge className={`text-xs ${STATUS_COLORS[project.status] || ''}`}>
                    {project.status.replace('_', ' ')}
                  </Badge>
                  {project.phase && (
                    <Badge variant="outline" className="text-xs">
                      {PHASE_LABELS[project.phase] || project.phase}
                    </Badge>
                  )}
                </div>
              )}

              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-muted-foreground shrink-0" />
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-muted-foreground">Tasks Complete</span>
                    <span className="font-semibold">{project.percentComplete ?? 0}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${project.percentComplete ?? 0}%`,
                        backgroundColor: project.color || '#3B82F6',
                      }}
                    />
                  </div>
                </div>
              </div>

              {(project.start_date || project.target_end_date) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>
                    {project.start_date ? format(parseISO(project.start_date), 'MMM d, yyyy') : '?'}
                    {' - '}
                    {project.target_end_date ? format(parseISO(project.target_end_date), 'MMM d, yyyy') : '?'}
                  </span>
                </div>
              )}
            </>
          )}

          {/* Sub-contractor task info */}
          {isSubTask && (
            <>
              {project.sub_contractor_name && (
                <div className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span>Contractor: <strong>{project.sub_contractor_name}</strong></span>
                </div>
              )}

              {(project.eta_start || project.eta_end) && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4 shrink-0" />
                  <span>
                    {project.eta_start ? format(parseISO(project.eta_start), 'MMM d, yyyy') : '?'}
                    {' - '}
                    {project.eta_end ? format(parseISO(project.eta_end), 'MMM d, yyyy') : '?'}
                  </span>
                </div>
              )}

              {project.notes && (
                <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{project.notes}</p>
              )}

              {/* Delete section */}
              <div className="pt-2 border-t border-border">
                {!confirming && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 w-full"
                    onClick={handleConfirm}
                  >
                    <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                    Remove from Schedule
                  </Button>
                )}

                {confirming && hasBid && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-2">
                    <div className="flex items-start gap-2 text-amber-800 text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <p>This task is linked to a contractor bid. To reschedule, use the bid card on the <strong>Sub-Contractors</strong> page.</p>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={() => setConfirming(false)}>
                      Got it
                    </Button>
                  </div>
                )}

                {confirming && !hasBid && (
                  <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3 space-y-2">
                    <p className="text-sm text-destructive">Remove this sub-contractor task from the schedule?</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirming(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        className="flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={handleDelete}
                        disabled={deleting}
                      >
                        {deleting ? 'Removing...' : 'Remove'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}