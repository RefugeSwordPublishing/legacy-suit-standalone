import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Receipt, Clock, Loader2 } from 'lucide-react';
import { DEFAULT_LABOR_HOUR_RATE, fetchLaborHourRate } from '@/lib/laborHourRate';

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

// Hours a subcontractor payment takes off the crew's budget: the payment at the labor hour rate.
export function hoursForPayment(amount, rate) {
  return rate > 0 ? round1(amount / rate) : 0;
}

// The two questions asked after a subcontractor payment is recorded, one at a time:
//   step 'expense'  add the payment as a project expense (the parent opens the prefilled form)
//   step 'hours'    deduct the equivalent crew hours from the project's budget hours
export default function SubPaymentFollowUpDialog({ open, step, amount, contractorName, project, busy, onDismiss, onExpense, onHours }) {
  const [rate, setRate] = useState(DEFAULT_LABOR_HOUR_RATE);

  // Read the company rate each time the hours question comes up, in case Estimate Settings changed.
  useEffect(() => {
    let cancelled = false;
    if (open && step === 'hours') fetchLaborHourRate().then((n) => { if (!cancelled) setRate(n); });
    return () => { cancelled = true; };
  }, [open, step]);

  const rateNum = Number(rate) || 0;
  const hours = hoursForPayment(amount, rateNum);
  const budget = Number(project?.budget_hours) || 0;
  const after = Math.max(0, round1(budget - hours));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !busy) onDismiss(); }}>
      <DialogContent className="max-w-sm">
        {step === 'expense' ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Receipt className="w-4 h-4 text-primary" />
                Add as an expense?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              You paid <strong className="text-foreground">{fmt(amount)}</strong> to {contractorName || 'this subcontractor'}.
              Record it as an expense{project?.name ? <> on <strong className="text-foreground">{project.name}</strong></> : ''}?
              The expense form opens with the details filled in.
            </p>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onExpense(false)}>No</Button>
              <Button onClick={() => onExpense(true)}>Yes, add expense</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                Deduct project hours?
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {contractorName || 'The subcontractor'} covered work your crew was budgeted for. Take the
              equivalent hours off <strong className="text-foreground">{project?.name}</strong>?
            </p>

            <div className="bg-muted/40 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Labor hour rate</span>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground">$</span>
                  <Input
                    type="number" min="1" step="1" value={rate}
                    onChange={(e) => setRate(e.target.value)}
                    className="h-8 w-20 text-right"
                  />
                  <span className="text-muted-foreground">/hr</span>
                </div>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{fmt(amount)} at {fmt(rateNum)}/hr</span>
                <span className="font-semibold">{hours} hrs</span>
              </div>
              <div className="flex justify-between border-t border-border pt-2">
                <span className="text-muted-foreground">Budget hours</span>
                <span className="font-semibold">{budget} hrs to {after} hrs</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">The rate comes from Estimate Settings. Changing it here applies to this payment only.</p>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => onHours(false)} disabled={busy}>No</Button>
              <Button onClick={() => onHours(true, hours, rateNum)} disabled={busy || hours <= 0}>
                {busy && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                Deduct {hours} hrs
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
