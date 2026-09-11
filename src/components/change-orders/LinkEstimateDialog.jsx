import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, CheckCircle2 } from 'lucide-react';

const fmt = (n) => (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function calcTrueGrandTotal(estimate) {
  const sectionsSubtotal = (estimate.sections || [])
    .flatMap(s => s.line_items || s.items || [])
    .reduce((sum, item) => sum + (item.line_total || item.total || 0), 0);
  const gcFee = estimate.gc_fee_enabled
    ? sectionsSubtotal * ((estimate.gc_fee_pct || 13) / 100)
    : 0;
  return sectionsSubtotal + gcFee;
}

export default function LinkEstimateDialog({ open, onOpenChange, onSelect, currentEstimateId }) {
  const [search, setSearch] = useState('');

  const { data: estimates = [], isLoading } = useQuery({
    queryKey: ['estimates-approved'],
    queryFn: () => base44.entities.Estimate.filter({ status: 'approved' }, '-created_date', 200),
    enabled: open,
  });

  const filtered = estimates.filter(e =>
    e.title?.toLowerCase().includes(search.toLowerCase()) ||
    e.client_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.project_name?.toLowerCase().includes(search.toLowerCase()) ||
    e.estimate_number?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Link to Approved Estimate</DialogTitle>
          <p className="text-sm text-muted-foreground">Select the approved estimate this change order modifies.</p>
        </DialogHeader>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search estimates..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>

        {isLoading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">No approved estimates found.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map(est => (
              <button
                key={est.id}
                onClick={() => onSelect(est)}
                className={`w-full text-left rounded-lg border px-4 py-3 hover:bg-muted/40 transition-colors ${
                  currentEstimateId === est.id ? 'border-primary bg-primary/5' : 'border-border bg-card'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {currentEstimateId === est.id && <CheckCircle2 className="w-4 h-4 text-primary shrink-0" />}
                      <span className="font-semibold text-sm truncate">{est.title}</span>
                      {est.estimate_number && (
                        <span className="text-xs text-muted-foreground shrink-0">#{est.estimate_number}</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
                      {est.client_name && <span>{est.client_name}</span>}
                      {est.project_name && <span>{est.project_name}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold text-sm">${fmt(calcTrueGrandTotal(est))}</p>
                    {est.gc_fee_enabled && (
                      <p className="text-xs text-muted-foreground">incl. GC fee</p>
                    )}
                    <Badge className="text-xs bg-green-100 text-green-800">Approved</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}