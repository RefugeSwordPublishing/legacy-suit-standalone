import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, parseISO } from 'date-fns';
import { Clock } from 'lucide-react';

function formatDuration(mins) {
  if (!mins && mins !== 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ProjectTimecardsModal({ open, onOpenChange, project }) {
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['time-entries-project-modal', project?.id],
    queryFn: () => base44.entities.TimeEntry.filter({ project_id: project.id }),
    enabled: open && !!project?.id,
  });

  const completed = entries
    .filter(e => e.status === 'clocked_out' && e.clock_out)
    .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0));

  const totalMins = completed.reduce((s, e) => s + (e.duration_minutes || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-accent" />
            {project?.name}, Timecards
          </DialogTitle>
        </DialogHeader>

        <div className="flex items-center justify-between text-sm text-muted-foreground border-b border-border pb-3 mb-1">
          <span>{completed.length} entries</span>
          <span className="font-semibold text-foreground">Total: {formatDuration(totalMins)}</span>
        </div>

        <div className="overflow-y-auto flex-1">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8 text-sm">Loading...</p>
          ) : completed.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No completed time entries for this project.</p>
          ) : (
            <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 sticky top-0">
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Employee</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Clock In</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Clock Out</th>
                  <th className="text-right px-3 py-2 font-medium text-muted-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {completed.map(entry => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                      {format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}
                    </td>
                    <td className="px-3 py-2.5">{entry.user_name}</td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : ''}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                      {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : ''}
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">
                      {formatDuration(entry.duration_minutes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}