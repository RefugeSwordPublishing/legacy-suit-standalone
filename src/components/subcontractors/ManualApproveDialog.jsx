import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function ManualApproveDialog({ open, onOpenChange, bidRequest, onApproved }) {
  const [contractorId, setContractorId] = useState('');
  const [bidAmount, setBidAmount] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: subs = [] } = useQuery({
    queryKey: ['sub-contractors'],
    queryFn: () => base44.entities.SubContractor.list(),
  });

  const handleSubmit = async () => {
    if (!contractorId || !bidAmount) {
      toast.error('Please select a contractor and enter a bid amount.');
      return;
    }
    setSaving(true);
    const contractor = subs.find(s => s.id === contractorId);

    try {
      // Create the submission already approved, and award the request (the old subContractorBid
      // edge fn was a stub, so this used to leave the bid stuck at 'submitted').
      const submission = await base44.entities.BidSubmission.create({
        bid_request_id: bidRequest.id,
        sub_contractor_id: contractorId,
        sub_contractor_name: contractor.business_name || contractor.contact_name,
        sub_contractor_email: contractor.email,
        bid_amount: parseFloat(bidAmount),
        status: 'approved',
      });
      await base44.entities.BidRequest.update(bidRequest.id, { status: 'awarded' });

      let emailed = false;
      if (contractor.email) {
        try {
          await base44.functions.invoke('sendEmail', {
            to: contractor.email,
            subject: `Your bid was approved — ${bidRequest.title || 'Project'}`,
            html: `<p>Good news — your bid of $${parseFloat(bidAmount).toLocaleString()} for <strong>${bidRequest.title || 'the project'}</strong>${bidRequest.project_address ? ` at ${bidRequest.project_address}` : ''} has been approved.</p><p>We will be in touch with next steps.</p>`,
          });
          emailed = true;
        } catch { /* best-effort */ }
      }
      void submission;
      toast.success(emailed ? 'Bid manually approved. Contractor notified.' : 'Bid manually approved.');
      onOpenChange(false);
      setContractorId('');
      setBidAmount('');
      onApproved();
    } catch (e) {
      toast.error(e?.message || 'Could not approve. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Manually Approve Bid
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div>
            <Label className="mb-1.5 block">Contractor</Label>
            <Select value={contractorId} onValueChange={setContractorId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a contractor…" />
              </SelectTrigger>
              <SelectContent>
                {subs.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.business_name || s.contact_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1.5 block">Bid Amount ($)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 12500"
              value={bidAmount}
              onChange={e => setBidAmount(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            className="bg-green-600 hover:bg-green-700 text-white"
            onClick={handleSubmit}
            disabled={saving}
          >
            <CheckCircle className="w-4 h-4 mr-1.5" />
            {saving ? 'Approving…' : 'Approve Bid'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}