import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { Clock, CheckCircle2, XCircle, ChevronDown, ChevronUp, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

const statusConfig = {
  open:     { label: 'Open',     color: 'bg-amber-100 text-amber-700 border border-amber-200',   icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-green-100 text-green-700 border border-green-200',   icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-100 text-red-700 border border-red-200',         icon: XCircle },
};

function RequestRow({ request, projects, users, onUpdate }) {
  const [expanded, setExpanded] = useState(false);
  const [assignTo, setAssignTo] = useState(request.assigned_to || '');
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const { toast } = useToast();

  const project = projects.find(p => p.id === request.project_id);
  const sc = statusConfig[request.status] || statusConfig.open;
  const StatusIcon = sc.icon;

  const handleAccept = async () => {
    setSaving(true);
    const task = await base44.entities.Task.create({
      project_id: request.project_id,
      title: request.title,
      notes: request.description || '',
      photo_urls: request.photo_urls || [],
      priority: 'high',
      status: 'pending',
      assigned_to: assignTo || undefined,
    });
    await base44.entities.ClientRequest.update(request.id, {
      status: 'accepted',
      assigned_to: assignTo || undefined,
      task_id: task.id,
    });
    setSaving(false);
    toast({ title: 'Request accepted', description: 'A task has been created.' });
    onUpdate();
  };

  const handleDecline = async () => {
    setSaving(true);
    await base44.entities.ClientRequest.update(request.id, { status: 'declined' });
    setSaving(false);
    toast({ title: 'Request declined.' });
    onUpdate();
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded(e => !e)}
      >
        <StatusIcon className={`w-4 h-4 mt-0.5 shrink-0 ${request.status === 'open' ? 'text-amber-500' : request.status === 'accepted' ? 'text-green-600' : 'text-red-500'}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium text-foreground">{request.title}</p>
            <Badge className={sc.color + ' text-xs'}>{sc.label}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {project?.name} {request.submitted_by ? `· by ${request.submitted_by}` : ''} · {new Date(request.created_date).toLocaleDateString()}
          </p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
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

          {request.status === 'open' && (
            <div className="space-y-3 pt-1">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Assign to (optional)</label>
                <Select value={assignTo} onValueChange={setAssignTo}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select team member..." />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map(u => {
                      const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email;
                      return (
                      <SelectItem key={u.id} value={fullName}>{fullName}</SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleAccept} disabled={saving} className="flex-1 bg-green-600 hover:bg-green-700 text-white">
                  <CheckCircle2 className="w-4 h-4" /> Accept & Create Task
                </Button>
                <Button onClick={handleDecline} disabled={saving} variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50">
                  <XCircle className="w-4 h-4" /> Decline
                </Button>
              </div>
            </div>
          )}

          {request.status === 'accepted' && request.assigned_to && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Assigned to <span className="font-medium text-foreground">{request.assigned_to}</span>
            </p>
          )}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="full" className="max-w-full max-h-full rounded-lg object-contain" />
          <button className="absolute top-4 right-4 text-white bg-black/50 rounded-full p-2" onClick={() => setLightbox(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

export default function ClientRequests() {
  const { currentUser } = useCurrentUser();
  const [filter, setFilter] = useState('open');
  const queryClient = useQueryClient();

  const { data: requests = [], refetch } = useQuery({
    queryKey: ['client-requests-all'],
    queryFn: () => base44.entities.ClientRequest.list('-created_date'),
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => base44.entities.User.list(),
  });

  const filteredRequests = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Client Requests</h1>
        <p className="text-muted-foreground mt-1">Review and action inbound client requests.</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['all', 'open', 'accepted', 'declined'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              filter === f ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f === 'all' ? 'All' : statusConfig[f]?.label}
            <span className="ml-1.5 text-xs opacity-70">
              {f === 'all' ? requests.length : requests.filter(r => r.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {filteredRequests.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">No {filter !== 'all' ? filter : ''} requests.</div>
      ) : (
        <div className="space-y-3">
          {filteredRequests.map(req => (
            <RequestRow
              key={req.id}
              request={req}
              projects={projects}
              users={users}
              onUpdate={refetch}
            />
          ))}
        </div>
      )}
    </div>
  );
}