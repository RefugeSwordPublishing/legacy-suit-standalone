import { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Search, CornerDownLeft } from 'lucide-react';

// Quick-nav command palette: type a page name or a term ("expenses", "clock in", "time off") and
// jump there. Destinations are pre-filtered by the caller to what this user can actually reach.
function score(dest, query) {
  const label = dest.label.toLowerCase();
  const kw = (dest.keywords || []).join(' ').toLowerCase();
  if (label === query) return 100;
  if (label.startsWith(query)) return 80;
  if (label.includes(query)) return 60;
  if (kw.includes(query)) return 40;
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length && tokens.every(t => label.includes(t) || kw.includes(t))) return 20;
  return -1;
}

export default function QuickSearch({ open, onOpenChange, destinations }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 40);
      return () => clearTimeout(t);
    }
  }, [open]);

  const results = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return destinations.slice(0, 8);
    return destinations
      .map(d => ({ d, s: score(d, query) }))
      .filter(x => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 12)
      .map(x => x.d);
  }, [q, destinations]);

  useEffect(() => { setActive(0); }, [q]);

  const go = (d) => {
    if (!d) return;
    onOpenChange(false);
    if (d.action) d.action();
    else if (d.path) navigate(d.path);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages… (e.g. expenses, clock in, time off)"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground pr-6"
          />
        </div>
        <div className="max-h-[55vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No matches for &ldquo;{q}&rdquo;</p>
          ) : (
            results.map((d, i) => {
              const Icon = d.icon;
              return (
                <button
                  key={(d.path || d.label) + i}
                  onClick={() => go(d)}
                  onMouseEnter={() => setActive(i)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${i === active ? 'bg-muted' : 'hover:bg-muted/50'}`}
                >
                  {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0" />}
                  <span className="flex-1 min-w-0">
                    <span className="block truncate text-foreground">{d.label}</span>
                    {d.hint && <span className="block truncate text-xs text-muted-foreground">{d.hint}</span>}
                  </span>
                  {i === active && <CornerDownLeft className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
