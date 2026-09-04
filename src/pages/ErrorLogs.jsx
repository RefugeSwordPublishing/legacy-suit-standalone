import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Bug, RefreshCw, Loader2, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';

export default function ErrorLogs() {
  const { currentUser } = useCurrentUser();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    setLogs(data || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // Error logs are platform-only; a tenant should never land here.
  if (currentUser && currentUser.is_platform_admin !== true) return <Navigate to="/" replace />;

  return (
    <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
            <Bug className="w-7 h-7" /> Error Log
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Recent errors captured across the app. Reference these when reporting an issue.</p>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 border border-border rounded-md hover:bg-muted shrink-0">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No errors logged. That's a good sign.</div>
      ) : (
        <div className="space-y-2">
          {logs.map(log => (
            <div key={log.id} className="bg-card border border-border rounded-lg">
              <button
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full text-left px-4 py-3 flex items-start gap-3"
              >
                <span className="text-[10px] font-mono uppercase tracking-wider bg-red-500/10 text-red-600 px-1.5 py-0.5 rounded shrink-0 mt-0.5">{log.source}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground break-words">{log.message}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.url} · {format(new Date(log.created_at), 'MMM d, h:mm a')}</p>
                </div>
                <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 mt-0.5 transition-transform ${expanded === log.id ? 'rotate-180' : ''}`} />
              </button>
              {expanded === log.id && (
                <div className="px-4 pb-3 border-t border-border pt-2">
                  <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words overflow-x-auto max-h-64">{JSON.stringify(log.details, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
