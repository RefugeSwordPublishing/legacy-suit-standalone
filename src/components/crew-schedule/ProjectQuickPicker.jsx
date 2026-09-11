import { useState, useRef, useEffect } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Plus } from 'lucide-react';
import { sortByName, naturalCompare } from '@/lib/naturalSort';

// Tap-to-fill project assignment: click "Add", type part of the address/name (e.g. "187"),
// and matching ACTIVE projects filter live (so "187" surfaces "1870 N Main"). Enter picks the
// top match. Replaces the long scrolling dropdown in the crew schedule cells.
export default function ProjectQuickPicker({ projects, onPick, isMobile }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = sortByName(
    q ? projects.filter(p => (p.name || '').toLowerCase().includes(q)) : projects
  );

  const pick = (id) => {
    onPick(id);
    setOpen(false);
    setQuery('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-center gap-0.5 border border-dashed border-border rounded text-muted-foreground hover:text-foreground hover:border-accent/60 transition-colors mt-0.5"
          style={{ height: isMobile ? 20 : 24, fontSize: 11 }}
        >
          <Plus className="w-3 h-3" />
          <span>Add</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="top"
        className="w-56 p-0"
        onOpenAutoFocus={(e) => { e.preventDefault(); inputRef.current?.focus(); }}
      >
        <div className="p-2 border-b border-border">
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Type a project or address..."
            className="h-8 text-sm"
            onKeyDown={e => {
              if (e.key === 'Enter' && matches.length > 0) { e.preventDefault(); pick(matches[0].id); }
              if (e.key === 'Escape') setOpen(false);
            }}
          />
        </div>
        <div className="max-h-56 overflow-y-auto py-1">
          {matches.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">No active projects match.</p>
          ) : (
            matches.map(p => (
              <button
                key={p.id}
                onClick={() => pick(p.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-muted/60 transition-colors"
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: p.color || '#3B82F6' }} />
                <span className="truncate">{p.name}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
