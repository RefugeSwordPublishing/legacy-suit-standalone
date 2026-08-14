export default function ProjectStatsBar({ stats }) {
  const { percent, totalTasks, totalRequests, acceptedRequests } = stats;
  const completedTasks = Math.round((percent / 100) * totalTasks);
  const openRequests = totalRequests - acceptedRequests;

  return (
    <div className="w-full space-y-3">
      {/* Progress bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="font-highway text-xs text-[#7A7560]">Task Completion</span>
          <span className="font-butler text-sm font-semibold text-[#30381E]">{percent}%</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: '#D4CFBA' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${percent}%`, background: '#30381E' }}
          />
        </div>
      </div>

      {/* Stat pills */}
      <div className="flex flex-wrap gap-2">
        <span
          className="font-highway text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#F5F3EC', color: '#30381E', border: '1px solid #D4CFBA' }}
        >
          {totalTasks} Tasks
        </span>
        <span
          className="font-highway text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#F5F3EC', color: '#30381E', border: '1px solid #D4CFBA' }}
        >
          {completedTasks} Completed
        </span>
        <span
          className="font-highway text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#F5F3EC', color: '#30381E', border: '1px solid #D4CFBA' }}
        >
          {openRequests} Open Requests
        </span>
        <span
          className="font-highway text-xs px-2.5 py-1 rounded-full"
          style={{ background: '#30381E', color: '#EAE8E1' }}
        >
          {acceptedRequests} Accepted
        </span>
      </div>
    </div>
  );
}