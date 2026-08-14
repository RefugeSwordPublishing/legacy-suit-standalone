import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { DollarSign } from 'lucide-react';
import { toast } from 'sonner';

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export default function PartialPaymentDialog({ open, onOpenChange, submission, totalAmount, onSaved }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const paidSoFar = submission?.paid_amount || 0;
  const remaining = totalAmount - paidSoFar;
  const newAmount = parseFloat(amount) || 0;
  const newTotal = paidSoFar + newAmount;
  const willBeFullyPaid = newTotal >= totalAmount;

  const handleSave = async () => {
    if (!newAmount || newAmount <= 0) return;
    setSaving(true);

    const newPayment = {
      amount: newAmount,
      date: new Date().toISOString(),
      note: note.trim() || null,
    };

    const payments = [...(submission.payments || []), newPayment];
    const newStatus = willBeFullyPaid ? 'paid' : 'partial_paid';

    await base44.entities.BidSubmission.update(submission.id, {
      paid_amount: newTotal,
      payments,
      status: newStatus,
      ...(willBeFullyPaid ? { paid_at: new Date().toISOString() } : {}),
    });

    if (willBeFullyPaid) {
      await base44.functions.invoke('syncBidPaymentToSheets', { bidSubmissionId: submission.id });
      toast.success('Marked as paid in full!');
    } else {
      toast.success(`Payment of ${fmt(newAmount)} recorded, ${fmt(totalAmount - newTotal)} remaining.`);
    }

    setSaving(false);
    setAmount('');
    setNote('');
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-primary" />
            Record Payment
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Balance summary */}
          <div className="bg-muted/40 rounded-lg p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Contract total</span>
              <span className="font-medium">{fmt(totalAmount)}</span>
            </div>
            {paidSoFar > 0 && (
              <div className="flex justify-between text-emerald-700">
                <span>Already paid</span>
                <span className="font-medium">{fmt(paidSoFar)}</span>
              </div>
            )}
            <div className="flex justify-between font-semibold border-t border-border pt-1 mt-1">
              <span>Remaining</span>
              <span>{fmt(remaining)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Payment amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="pl-8"
              />
            </div>
            {newAmount > 0 && (
              <p className={`text-xs ${willBeFullyPaid ? 'text-emerald-600' : 'text-amber-600'}`}>
                {willBeFullyPaid
                  ? 'This will mark the contract as paid in full.'
                  : `${fmt(totalAmount - newTotal)} will remain after this payment.`}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Note <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Textarea
              placeholder="Check #, payment method, etc."
              value={note}
              onChange={e => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !newAmount || newAmount <= 0}>
            {saving ? 'Saving...' : willBeFullyPaid ? 'Mark Paid in Full' : 'Record Payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
