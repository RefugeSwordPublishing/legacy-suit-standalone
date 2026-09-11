import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Clock, ChevronRight, AlertCircle, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const PHASES = ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6'];
const PHASE_LABELS = {
  phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3',
  phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6',
};
const phaseColors = {
  phase_1: 'bg-violet-100 text-violet-700 border-violet-200',
  phase_2: 'bg-blue-100 text-blue-700 border-blue-200',
  phase_3: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  phase_4: 'bg-amber-100 text-amber-700 border-amber-200',
  phase_5: 'bg-orange-100 text-orange-700 border-orange-200',
  phase_6: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

export default function PhaseApprovalBanner({ project, tasks, onProjectUpdated }) {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(null); // approval request object
  const [reviewNotes, setReviewNotes] = useState('');

  const isHighRole = ['owner', 'coo', 'admin'].includes(currentUser?.role);
  const isSiteManager = currentUser?.role === 'site_manager';
  const currentPhase = project.phase || 'phase_1';
  const currentPhaseIdx = PHASES.indexOf(currentPhase);
  const isLastPhase = currentPhaseIdx === PHASES.length - 1;

  const { data: approvalRequests = [] } = useQuery({
    queryKey: ['phase-approvals', project.id],
    queryFn: () => base44.entities.PhaseApprovalRequest.filter({ project_id: project.id }),
    enabled: !!project.id,
  });

  const pendingRequest = approvalRequests.find(r => r.status === 'pending' && r.current_phase === currentPhase);
  const phaseTasks = tasks.filter(t => t.phase === currentPhase);
  const allPhaseTasksDone = phaseTasks.length > 0 && phaseTasks.every(t => t.status === 'completed');
  const hasAnyPhaseTasks = phaseTasks.length > 0;

  const myName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email;

  const requestApproval = async () => {
    setSaving(true);
    const req = await base44.entities.PhaseApprovalRequest.create({
      project_id: project.id,
      project_name: project.name,
      current_phase: currentPhase,
      requested_by_id: currentUser.id,
      requested_by_name: myName,
      status: 'pending',
    });

    // Notify all high roles
    const highRoleProfiles = await base44.entities.UserProfile.filter({ role: 'owner' });
    const cooProfiles = await base44.entities.UserProfile.filter({ role: 'coo' });
    const adminProfiles = await base44.entities.UserProfile.filter({ role: 'admin' });
    const toNotify = [...highRoleProfiles, ...cooProfiles, ...adminProfiles];
    for (const p of toNotify) {
      await base44.entities.Notification.create({
        user_id: p.user_id,
        type: 'phase_approval',
        title: '📋 Phase Approval Requested',
        message: `${myName} is requesting ${PHASE_LABELS[currentPhase]} approval for ${project.name}.`,
        project_id: project.id,
        project_name: project.name,
        read: false,
      });
    }
    queryClient.invalidateQueries({ queryKey: ['phase-approvals', project.id] });
    setSaving(false);
  };

  const handleReview = async (approved) => {
    setSaving(true);
    const nextPhaseIdx = currentPhaseIdx + 1;
    await base44.entities.PhaseApprovalRequest.update(reviewOpen.id, {
      status: approved ? 'approved' : 'declined',
      reviewed_by: myName,
      notes: reviewNotes,
    });

    if (approved && nextPhaseIdx < PHASES.length) {
      const nextPhase = PHASES[nextPhaseIdx];
      await base44.entities.Project.update(project.id, { phase: nextPhase, phase_since: new Date().toISOString().split('T')[0] });

      // Find template tasks for the next phase and create them
      const templates = await base44.entities.TaskTemplate.filter({ phase: nextPhase });
      for (const tmpl of templates) {
        for (const t of (tmpl.tasks || [])) {
          await base44.entities.Task.create({
            project_id: project.id,
            title: t.title,
            priority: t.priority || 'medium',
            notes: t.notes || '',
            status: 'pending',
            phase: nextPhase,
          });
        }
      }

      // Notify the site manager
      await base44.entities.Notification.create({
        user_id: reviewOpen.requested_by_id,
        type: 'phase_approval',
        title: `✅ ${PHASE_LABELS[currentPhase]} Approved!`,
        message: `${project.name} has advanced to ${PHASE_LABELS[nextPhase]}. New phase tasks are ready to assign.`,
        project_id: project.id,
        project_name: project.name,
        read: false,
      });
    } else if (!approved) {
      // Notify site manager of decline
      await base44.entities.Notification.create({
        user_id: reviewOpen.requested_by_id,
        type: 'phase_approval',
        title: `❌ ${PHASE_LABELS[currentPhase]} Approval Declined`,
        message: `Phase approval for ${project.name} was declined.${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
        project_id: project.id,
        project_name: project.name,
        read: false,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['phase-approvals', project.id] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    queryClient.invalidateQueries({ queryKey: ['tasks', project.id] });
    onProjectUpdated?.();
    setReviewOpen(null);
    setReviewNotes('');
    setSaving(false);
  };

  // Site manager: show request button if all tasks done and no pending request
  // High role: show pending approval requests for this project
  if (!isSiteManager && !isHighRole) return null;
  if (isLastPhase && !pendingRequest && isHighRole && approvalRequests.filter(r => r.status === 'pending').length === 0) return null;

  const pendingForHighRole = approvalRequests.filter(r => r.status === 'pending');

  return (
    <div className="space-y-2">
      {/* Current phase badge */}
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className={`text-xs ${phaseColors[currentPhase]}`}>
          {PHASE_LABELS[currentPhase]}
        </Badge>
        {phaseTasks.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {phaseTasks.filter(t => t.status === 'completed').length}/{phaseTasks.length} phase tasks complete
          </span>
        )}
      </div>

      {/* Site manager: request approval button */}
      {isSiteManager && !pendingRequest && !isLastPhase && (
        <div className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${
          allPhaseTasksDone ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-muted/30'
        }`}>
          <div className="flex items-center gap-2 text-sm">
            {allPhaseTasksDone
              ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              : <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
            }
            <span className={allPhaseTasksDone ? 'text-emerald-700 font-medium' : 'text-muted-foreground'}>
              {allPhaseTasksDone
                ? `All ${PHASE_LABELS[currentPhase]} tasks complete, ready for approval`
                : hasAnyPhaseTasks
                  ? `Complete all ${PHASE_LABELS[currentPhase]} tasks to request phase approval`
                  : `No tasks assigned to ${PHASE_LABELS[currentPhase]} yet`
              }
            </span>
          </div>
          {allPhaseTasksDone && (
            <Button size="sm" onClick={requestApproval} disabled={saving} className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving ? 'Requesting...' : 'Request Approval'}
              <ChevronRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          )}
        </div>
      )}

      {/* Pending request indicator for site manager */}
      {isSiteManager && pendingRequest && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-sm text-amber-700">
          <Clock className="w-4 h-4 shrink-0" />
          <span>Phase approval requested, awaiting review by management</span>
        </div>
      )}

      {/* High role: review pending approvals */}
      {isHighRole && pendingForHighRole.length > 0 && (
        <div className="space-y-2">
          {pendingForHighRole.map(req => (
            <div key={req.id} className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="text-amber-800 font-medium">
                  {req.requested_by_name} requested {PHASE_LABELS[req.current_phase]} approval
                </span>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setReviewOpen(req); setReviewNotes(''); }} className="shrink-0 border-amber-300 text-amber-800 hover:bg-amber-100">
                Review
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Review dialog */}
      <Dialog open={!!reviewOpen} onOpenChange={o => !o && setReviewOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Phase Approval</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
              <p><span className="font-medium">Project:</span> {reviewOpen?.project_name}</p>
              <p><span className="font-medium">Phase:</span> {PHASE_LABELS[reviewOpen?.current_phase]}</p>
              <p><span className="font-medium">Requested by:</span> {reviewOpen?.requested_by_name}</p>
            </div>
            {currentPhaseIdx < PHASES.length - 1 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="w-4 h-4" />
                <span>Approving will advance the project to <strong>{PHASE_LABELS[PHASES[currentPhaseIdx + 1]]}</strong> and add any associated template tasks.</span>
              </div>
            )}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                rows={2}
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="Add a note for the site manager..."
                className="mt-1 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => handleReview(true)} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white">
                {saving ? 'Approving...' : '✓ Approve & Advance Phase'}
              </Button>
              <Button onClick={() => handleReview(false)} disabled={saving} variant="outline" className="flex-1 text-destructive border-destructive/30 hover:bg-destructive/5">
                Decline
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}