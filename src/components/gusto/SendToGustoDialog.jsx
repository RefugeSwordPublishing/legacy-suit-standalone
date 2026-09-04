import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// Push the computed per-employee regular/overtime hours onto an unprocessed Gusto payroll.
// Only workers with a Gusto employee mapping are sent; the rest are listed as skipped.
export default function SendToGustoDialog({ open, onOpenChange, payrollRows, profilesById }) {
  const { toast } = useToast();
  const [payrolls, setPayrolls] = useState([]);
  const [payrollId, setPayrollId] = useState('');
  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPayrollId('');
    setLoading(true);
    base44.functions.invoke('gustoSyncV2', { action: 'list_open_payrolls' }).then(res => {
      if (res.data?.error) throw new Error(res.data.error);
      setPayrolls(res.data?.payrolls || []);
    }).catch(e => toast({ title: 'Could not load Gusto payrolls', description: e.message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open]);

  const mapped = payrollRows.filter(r => profilesById[r.userId]?.gusto_employee_uuid);
  const unmapped = payrollRows.filter(r => !profilesById[r.userId]?.gusto_employee_uuid);

  const push = async () => {
    if (!payrollId) return;
    setPushing(true);
    try {
      const hours = mapped.map(r => ({
        employeeUuid: profilesById[r.userId].gusto_employee_uuid,
        regular: r.regularHours, overtime: r.overtimeHours,
      }));
      const res = await base44.functions.invoke('gustoSyncV2', { action: 'push_hours', payrollId, hours });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'Hours sent to Gusto', description: `Updated ${res.data.updated} ${res.data.updated === 1 ? 'employee' : 'employees'}. Review and run the payroll in Gusto.` });
      onOpenChange(false);
    } catch (e) {
      toast({ title: 'Push failed', description: e.message, variant: 'destructive' });
    } finally { setPushing(false); }
  };

  const fmtRange = (p) => `${p.startDate || '?'} to ${p.endDate || '?'}${p.checkDate ? ` · check ${p.checkDate}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Send hours to Gusto</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Unprocessed payroll</p>
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading payrolls…</div>
            ) : payrolls.length ? (
              <Select value={payrollId} onValueChange={setPayrollId}>
                <SelectTrigger><SelectValue placeholder="Select a pay period…" /></SelectTrigger>
                <SelectContent>
                  {payrolls.map(p => <SelectItem key={p.uuid} value={p.uuid}>{fmtRange(p)}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-muted-foreground">No unprocessed regular payrolls found in Gusto.</p>
            )}
          </div>

          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm space-y-1.5">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> {mapped.length} mapped {mapped.length === 1 ? 'worker' : 'workers'} will be sent</div>
            {unmapped.length > 0 && (
              <div className="flex items-start gap-2 text-amber-700">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>{unmapped.length} skipped (no Gusto mapping): {unmapped.map(r => r.userName).join(', ')}</span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pushing}>Cancel</Button>
            <Button onClick={push} disabled={pushing || !payrollId || !mapped.length} className="gap-2">
              {pushing && <Loader2 className="w-4 h-4 animate-spin" />} Send hours
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
