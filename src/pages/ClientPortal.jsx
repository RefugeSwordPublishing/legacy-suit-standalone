import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { isClient } from '@/lib/permissions';
import { Building2, ChevronRight, ArrowLeft, Plus, Clock, CheckCircle2, XCircle, BarChart3, ListChecks, Inbox } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import NewClientRequestDialog from '@/components/client-portal/NewClientRequestDialog';
import ClientRequestCard from '@/components/client-portal/ClientRequestCard';
import ProjectStatsBar from '@/components/client-portal/ProjectStatsBar';
import { useBranding } from '@/lib/useBranding';

const statusConfig = {
  open:     { label: 'Open',     color: 'bg-amber-50 text-amber-700 border-amber-300',          icon: Clock },
  accepted: { label: 'Accepted', color: 'bg-[#30381E] text-[#EAE8E1] border-[#30381E]',         icon: CheckCircle2 },
  declined: { label: 'Declined', color: 'bg-red-50 text-red-600 border-red-200',                icon: XCircle },
};

export default function ClientPortal() {
  const { currentUser } = useCurrentUser();
  const b = useBranding();
  const [selectedProject, setSelectedProject] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showNewRequest, setShowNewRequest] = useState(false);

  const clientMode = isClient(currentUser);

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => base44.entities.Project.list(),
  });

  const { data: allTasks = [] } = useQuery({
    queryKey: ['all-tasks'],
    queryFn: () => base44.entities.Task.list(),
    enabled: clientMode,
  });

  const { data: allRequests = [] } = useQuery({
    queryKey: ['all-client-requests'],
    queryFn: () => base44.entities.ClientRequest.list(),
    enabled: clientMode,
  });

  const { data: requests = [], refetch: refetchRequests } = useQuery({
    queryKey: ['client-requests', selectedProject?.id],
    queryFn: () => base44.entities.ClientRequest.filter({ project_id: selectedProject.id }, '-created_date'),
    enabled: !!selectedProject,
  });

  // For client users: show projects they are assigned to (by name match on client_name or assigned_project_ids)
  const visibleProjects = clientMode
    ? projects.filter(p =>
        (currentUser?.assigned_project_ids || []).includes(p.id) ||
        (p.client_name && (
          p.client_name === currentUser?.full_name ||
          p.client_name === currentUser?.email
        ))
      )
    : projects.filter(p => p.status === 'active');

  const filteredRequests = filter === 'all' ? requests : requests.filter(r => r.status === filter);

  const getProjectStats = (project) => {
    const tasks = allTasks.filter(t => t.project_id === project.id);
    const completed = tasks.filter(t => t.status === 'completed').length;
    const total = tasks.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    const projectRequests = allRequests.filter(r => r.project_id === project.id);
    const totalRequests = projectRequests.length;
    const acceptedRequests = projectRequests.filter(r => r.status === 'accepted').length;
    return { percent, totalRequests, acceptedRequests, totalTasks: total };
  };

  if (!selectedProject) {
    return (
      <div className="min-h-screen bg-[#EAE8E1] p-6">
        <div className="max-w-3xl mx-auto">
          {/* Logo header */}
          <div className="flex flex-col items-center mb-8 pt-2">
            <img
              src={b.logo_url}
              alt={b.company_name}
              className="h-16 w-auto mb-4 object-contain"
            />
            <h1 className="font-butler text-2xl font-bold text-[#30381E]">Client Portal</h1>
            <p className="font-highway text-[#7A7560] mt-1 text-sm">
              {clientMode ? 'Your projects and requests.' : 'Select a project to view or submit requests.'}
            </p>
          </div>

          {visibleProjects.length === 0 ? (
            <div className="text-center py-16 font-highway text-[#7A7560]">
              {clientMode ? 'No projects assigned to you yet.' : 'No active projects found.'}
            </div>
          ) : (
            <div className="space-y-3">
              {visibleProjects.map(project => {
                const stats = clientMode ? getProjectStats(project) : null;
                return (
                  <button
                    key={project.id}
                    onClick={() => setSelectedProject(project)}
                    className="w-full flex flex-col gap-3 p-4 text-left group transition-all hover:shadow-md"
                    style={{
                      background: '#F5F3EC',
                      border: '1px solid #D4CFBA',
                      borderRadius: '6px',
                      boxShadow: '0 1px 4px rgba(48,56,30,0.08)',
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className="w-10 h-10 flex items-center justify-center shrink-0"
                        style={{ background: '#30381E', borderRadius: '6px' }}
                      >
                        <Building2 className="w-5 h-5" style={{ color: '#EAE8E1' }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-butler font-semibold text-[#30381E] truncate">{project.name}</p>
                        {project.address && <p className="font-highway text-sm text-[#7A7560] truncate">{project.address}</p>}
                      </div>
                      <ChevronRight className="w-4 h-4 text-[#7A7560] group-hover:text-[#30381E] transition-colors shrink-0" />
                    </div>
                    {clientMode && stats && (
                      <ProjectStatsBar stats={stats} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#EAE8E1] p-6">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setSelectedProject(null)}
            className="p-2 rounded hover:bg-[#D4CFBA] transition-colors"
          >
            <ArrowLeft className="w-4 h-4 text-[#30381E]" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="font-butler text-xl font-bold text-[#30381E] truncate">{selectedProject.name}</h1>
            <p className="font-highway text-sm text-[#7A7560]">Client Requests</p>
          </div>
          <button
            onClick={() => setShowNewRequest(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-highway font-medium transition-colors"
            style={{ background: '#30381E', color: '#EAE8E1', borderRadius: '4px' }}
          >
            <Plus className="w-4 h-4" />
            New Request
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5 flex-wrap">
          {['all', 'open', 'accepted', 'declined'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 text-sm font-highway font-medium transition-all"
              style={{
                borderRadius: '4px',
                background: filter === f ? '#30381E' : '#F5F3EC',
                color: filter === f ? '#EAE8E1' : '#7A7560',
                border: `1px solid ${filter === f ? '#30381E' : '#D4CFBA'}`,
              }}
            >
              {f === 'all' ? 'All' : statusConfig[f].label}
              <span className="ml-1.5 text-xs opacity-70">
                {f === 'all' ? requests.length : requests.filter(r => r.status === f).length}
              </span>
            </button>
          ))}
        </div>

        {/* Requests */}
        {filteredRequests.length === 0 ? (
          <div className="text-center py-16 font-highway text-[#7A7560]">
            {filter === 'all' ? 'No requests yet. Submit your first request!' : `No ${filter} requests.`}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRequests.map(req => (
              <ClientRequestCard
                key={req.id}
                request={req}
                statusConfig={statusConfig}
                onUpdate={refetchRequests}
                currentUser={currentUser}
              />
            ))}
          </div>
        )}

        {showNewRequest && (
          <NewClientRequestDialog
            project={selectedProject}
            currentUser={currentUser}
            onClose={() => setShowNewRequest(false)}
            onCreated={() => { setShowNewRequest(false); refetchRequests(); }}
          />
        )}
      </div>
    </div>
  );
}