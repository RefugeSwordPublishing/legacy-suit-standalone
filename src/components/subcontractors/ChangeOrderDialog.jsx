import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlusCircle } from 'lucide-react';

export default function ChangeOrderDialog({ open, onOpenChange, bidRequest, submission, onSaved }) {
  const { currentUser } = useCurrentUser();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!amount || isNaN(parseFloat(amount))) return;
    setSaving(true);
    await base44.entities.ChangeOrder.create({
      bid_request_id: bidRequest.id,
      bid_submission_id: submission.id,
      sub_contractor_name: submission.sub_contractor_name,
      project_name: bidRequest.project_name,
      description: description.trim(),
      amount: parseFloat(amount),
      status: 'approved',
      created_by_name: currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : '',
    });
    setSaving(false);
    setAmount('');
    setDescription('');
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-primary" />
            Add Change Order
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {submission?.sub_contractor_name} · {bidRequest?.project_name}
          </p>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div>
            <Label className="mb-1 block">Additional Amount ($) *</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              placeholder="e.g. 2500"
            />
          </div>

          <div>
            <Label className="mb-1 block">Description</Label>
            <Textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the additional work or reason for change order…"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button
              className="flex-1"
              onClick={handleSave}
              disabled={saving || !amount || isNaN(parseFloat(amount))}
            >
              {saving ? 'Saving...' : 'Add Change Order'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}