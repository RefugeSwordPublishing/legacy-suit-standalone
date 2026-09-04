import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MapPin, KeyRound, Copy, Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { naturalCompare } from '@/lib/naturalSort';

// A stripped-down, read-only project directory for crew: active job sites only, with the address
// and lockbox code they need on the way to a site. No financials, tasks, or project management.
export default function JobSites() {
  const { toast } = useToast();

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['job-sites'],
    queryFn: () => base44.entities.Project.list(),
  });

  const activeProjects = projects
    .filter(p => p.status === 'active')
    .sort((a, b) => naturalCompare(a.name || '', b.name || ''));

  const copy = async (label, value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      // Clipboard can be blocked (insecure context / permissions); fail quietly.
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Job Sites</h1>
        <p className="text-sm text-muted-foreground mt-1">Active sites with address and lockbox code.</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : activeProjects.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No active job sites right now.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {activeProjects.map(project => (
            <div key={project.id} className="rounded-xl border border-border bg-card p-4 space-y-3">
              <div>
                <h2 className="font-semibold text-foreground leading-tight">{project.name}</h2>
                {project.client_name && (
                  <p className="text-xs text-muted-foreground mt-0.5">{project.client_name}</p>
                )}
              </div>

              <button
                onClick={() => copy('Address', project.address)}
                disabled={!project.address}
                className="w-full flex items-start gap-2 text-left rounded-lg bg-muted/50 px-3 py-2 enabled:hover:bg-muted disabled:opacity-60 transition-colors group"
              >
                <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground break-words">
                  {project.address || <span className="text-muted-foreground">No address on file</span>}
                </span>
                {project.address && <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
              </button>

              <button
                onClick={() => copy('Lockbox code', project.lockbox_code)}
                disabled={!project.lockbox_code}
                className="w-full flex items-center gap-2 text-left rounded-lg bg-muted/50 px-3 py-2 enabled:hover:bg-muted disabled:opacity-60 transition-colors group"
              >
                <KeyRound className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 text-sm text-foreground">
                  {project.lockbox_code
                    ? <span className="font-mono tracking-wide">{project.lockbox_code}</span>
                    : <span className="text-muted-foreground">No lockbox code</span>}
                </span>
                {project.lockbox_code && <Copy className="w-3.5 h-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
