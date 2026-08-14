import { useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export default function ClientRequestCard({ request, statusConfig }) {
  const [expanded, setExpanded] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  const sc = statusConfig[request.status] || statusConfig.open;
  const StatusIcon = sc.icon;

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${
          request.status === 'open' ? 'text-amber-500' :
          request.status === 'accepted' ? 'text-green-600' : 'text-red-500'
        }`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground">{request.title}</p>
            <Badge className={sc.color + ' text-xs border'}>{sc.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {request.created_date ? format(new Date(request.created_date), 'MMM d, yyyy') : ''}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {request.description && (
            <p className="text-sm text-foreground/80">{request.description}</p>
          )}

          {request.photo_urls?.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {request.photo_urls.map((url, i) => (
                <img
                  key={i}
                  src={url}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover border border-border cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setLightbox(url)}
                />
              ))}
            </div>
          )}

          {request.status === 'accepted' && request.assigned_to && (
            <p className="text-sm text-muted-foreground">
              Assigned to <span className="font-medium text-foreground">{request.assigned_to}</span>
            </p>
          )}

          {request.status === 'declined' && request.decline_reason && (
            <p className="text-sm text-muted-foreground italic">"{request.decline_reason}"</p>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox} alt="full" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}