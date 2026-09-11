import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Users, Coffee, Clock, Pencil, Trash2, LogOut, MoreHorizontal } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

function ElapsedTimer({ clockIn }) {
  const [elapsed, setElapsed] = useState('');
  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000);
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [clockIn]);
  return <span className="font-mono text-sm font-semibold text-accent">{elapsed}</span>;
}

export default function ClockedInNow({ onEdit, onDelete, onClockOut, isManager }) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data: activeEntries = [], isLoading } = useQuery({
    queryKey: ['clocked-in-now', todayStr],
    queryFn: async () => {
      const entries = await base44.entities.TimeEntry.filter({ date: todayStr });
      return entries.filter(e => e.status === 'clocked_in' || e.status === 'on_break');
    },
    refetchInterval: 30000, // refresh every 30s
  });

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center gap-2">
        <Users className="w-4 h-4 text-accent" />
        <h2 className="text-sm font-semibold text-foreground">Currently Clocked In</h2>
        <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
          {activeEntries.length} active
        </span>
      </div>

      {isLoading ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Loading...</div>
      ) : activeEntries.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">No one is currently clocked in.</div>
      ) : (
        <div className="divide-y divide-border">
          {activeEntries.map(entry => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full shrink-0 ${entry.status === 'on_break' ? 'bg-amber-400' : 'bg-emerald-500'}`} />
                <div>
                  <p className="text-sm font-medium text-foreground">{entry.user_name}</p>
                  <p className="text-xs text-muted-foreground">{entry.project_name}</p>
                </div>
                {entry.status === 'on_break' && (
                  <span className="text-xs text-amber-600 flex items-center gap-1">
                    <Coffee className="w-3 h-3" /> On Break
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <ElapsedTimer clockIn={entry.clock_in} />
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" /> In at {format(new Date(entry.clock_in), 'h:mm a')}
                  </p>
                </div>
                {isManager && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onClockOut?.(entry)} className="text-red-600">
                        <LogOut className="w-4 h-4 mr-2" /> Clock Out Now
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onEdit?.(entry)}>
                        <Pencil className="w-4 h-4 mr-2" /> Edit Entry
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onDelete?.(entry)} className="text-red-600">
                        <Trash2 className="w-4 h-4 mr-2" /> Delete Entry
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}