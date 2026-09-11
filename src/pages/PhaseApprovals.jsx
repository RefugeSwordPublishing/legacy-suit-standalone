import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, AlertCircle, Clock } from 'lucide-react';
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

const HIGH_ROLES = ['owner', 'coo', 'admin'];

export default function PhaseApprovals() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const isHighRole = HIGH_ROLES.includes(currentUser?.role);

  const { data: pendingApprovals = [], isLoading } = useQuery({
    queryKey: ['phase-approvals-all'],
    queryFn: () => base44.entities.PhaseApprovalRequest.filter({ status: 'pending' }),
    enabled: isHighRole,
  });

  const myName = [currentUser?.first_name, currentUser?.last_name].filter(Boolean).join(' ') || currentUser?.email;

  const handleReview = async (approved) => {
    setSaving(true);
    const req = reviewOpen;
    const currentPhaseIdx = PHASES.indexOf(req.current_phase);
    const nextPhaseIdx = currentPhaseIdx + 1;

    await base44.entities.PhaseApprovalRequest.update(req.id, {
      status: approved ? 'approved' : 'declined',
      reviewed_by: myName,
      notes: reviewNotes,
    });

    if (approved && nextPhaseIdx < PHASES.length) {
      const nextPhase = PHASES[nextPhaseIdx];
      await base44.entities.Project.update(req.project_id, { phase: nextPhase });

      const templates = await base44.entities.TaskTemplate.filter({ phase: nextPhase });
      for (const tmpl of templates) {
        for (const t of (tmpl.tasks || [])) {
          await base44.entities.Task.create({
            project_id: req.project_id,
            title: t.title,
            priority: t.priority || 'medium',
            notes: t.notes || '',
            status: 'pending',
            phase: nextPhase,
          });
        }
      }

      await base44.entities.Notification.create({
        user_id: req.requested_by_id,
        type: 'phase_approval',
        title: `✅ ${PHASE_LABELS[req.current_phase]} Approved!`,
        message: `${req.project_name} has advanced to ${PHASE_LABELS[nextPhase]}. New phase tasks are ready to assign.`,
        project_id: req.project_id,
        project_name: req.project_name,
        read: false,
      });
    } else if (!approved) {
      await base44.entities.Notification.create({
        user_id: req.requested_by_id,
        type: 'phase_approval',
        title: `❌ ${PHASE_LABELS[req.current_phase]} Approval Declined`,
        message: `Phase approval for ${req.project_name} was declined.${reviewNotes ? ` Reason: ${reviewNotes}` : ''}`,
        project_id: req.project_id,
        project_name: req.project_name,
        read: false,
      });
    }

    queryClient.invalidateQueries({ queryKey: ['phase-approvals-all'] });
    queryClient.invalidateQueries({ queryKey: ['projects'] });
    setReviewOpen(null);
    setReviewNotes('');
    setSaving(false);
  };

  if (!isHighRole) {
    return (
      <div className="p-6 md:p-8 max-w-3xl mx-auto text-center py-20">
        <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
        <h3 className="text-lg font-semibold">Access Restricted</h3>
        <p className="text-sm text-muted-foreground mt-1">Only owners, COOs, and admins can view phase approvals.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Phase Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">Review and approve pending phase transitions</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-muted border-t-accent rounded-full animate-spin" />
        </div>
      ) : pendingApprovals.length === 0 ? (
        <div className="text-center py-20 bg-card border border-border rounded-xl">
          <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground">All caught up!</h3>
          <p className="text-sm text-muted-foreground mt-1">No pending phase approvals at this time.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pendingApprovals.map(req => {
            const phaseIdx = PHASES.indexOf(req.current_phase);
            const nextPhase = PHASES[phaseIdx + 1];
            return (
              <div key={req.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4">
                <div className="space-y-1.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground truncate">{req.project_name}</span>
                    <Badge variant="outline" className={`text-xs ${phaseColors[req.current_phase]}`}>
                      {PHASE_LABELS[req.current_phase]}
                    </Badge>
                    {nextPhase && (
                      <span className="text-xs text-muted-foreground">→ {PHASE_LABELS[nextPhase]}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>Requested by <strong className="text-foreground">{req.requested_by_name}</strong></span>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setReviewOpen(req); setReviewNotes(''); }}
                  className="shrink-0 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Review
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Dialog */}
      <Dialog open={!!reviewOpen} onOpenChange={o => !o && setReviewOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Phase Approval</DialogTitle>
          </DialogHeader>
          {reviewOpen && (() => {
            const phaseIdx = PHASES.indexOf(reviewOpen.current_phase);
            const nextPhase = PHASES[phaseIdx + 1];
            return (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                  <p><span className="font-medium">Project:</span> {reviewOpen.project_name}</p>
                  <p><span className="font-medium">Phase:</span> {PHASE_LABELS[reviewOpen.current_phase]}</p>
                  <p><span className="font-medium">Requested by:</span> {reviewOpen.requested_by_name}</p>
                </div>
                {nextPhase && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>Approving will advance the project to <strong>{PHASE_LABELS[nextPhase]}</strong> and add any associated template tasks.</span>
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
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}