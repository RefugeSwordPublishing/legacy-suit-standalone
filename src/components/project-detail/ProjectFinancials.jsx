import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown } from 'lucide-react';

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Salaried management is not tracked as hourly labor cost.
const MANAGEMENT_ROLES = ['owner', 'coo', 'admin', 'site_manager'];

// Friendly series names, shared by the chart legend and tooltip.
const SERIES_LABELS = {
  'Est. Labor': 'Est. Labor',
  'Est. Sub': 'Est. Subcontractor',
  'Estimated Materials': 'Est. Materials',
  'Actual Labor': 'Actual Labor',
  'Actual Sub': 'Actual Subcontractor',
  'Actual Materials': 'Actual Materials',
};

// Only show the series that actually have a value for the hovered bar, so tapping "Materials"
// shows just the two material rows instead of all six with four blanks.
function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter(p => (p.value || 0) > 0);
  if (!rows.length) return null;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 shadow-md text-xs">
      <div className="font-semibold text-foreground mb-1">{label}</div>
      {rows.map(r => (
        <div key={r.dataKey} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: r.color }} />
            <span className="text-muted-foreground">{SERIES_LABELS[r.dataKey] || r.name}</span>
          </span>
          <span className="font-semibold text-foreground">{fmt(r.value)}</span>
        </div>
      ))}
    </div>
  );
}

export default function ProjectFinancials({ project, projectId }) {
  const { data: estimates = [] } = useQuery({
    queryKey: ['estimates-for-project', projectId],
    queryFn: () => base44.entities.Estimate.list().then(all => all.filter(e => e.project_id === projectId)),
    enabled: !!projectId,
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ['expenses-for-project', projectId],
    queryFn: () => base44.entities.Expense.list().then(all => all.filter(e => e.project_id === projectId)),
    enabled: !!projectId,
  });

  const { data: timeEntries = [] } = useQuery({
    queryKey: ['time-entries-project', projectId],
    queryFn: () => base44.entities.TimeEntry.list().then(all => all.filter(e => e.project_id === projectId)),
    enabled: !!projectId,
  });

  const { data: userProfiles = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
  });

  const { data: expenseCats = [] } = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => base44.entities.ExpenseCategory.list('sort_order', 200),
  });

  // Roll an expense into a cost bucket via its category (case-insensitive; legacy
  // 'materials'/'subcontractor' slugs match the seeded category names).
  const catBucket = useMemo(() => {
    const m = {};
    expenseCats.forEach(c => { m[(c.name || '').toLowerCase()] = c.cost_bucket; });
    return m;
  }, [expenseCats]);
  const bucketOf = (e) => catBucket[(e.expense_category || '').toLowerCase()]
    || (e.expense_category === 'subcontractor' ? 'subcontractor' : 'materials');

  const { data: allBidRequests = [] } = useQuery({
    queryKey: ['bid-requests-project', projectId],
    queryFn: () => base44.entities.BidRequest.list().then(all => all.filter(b => b.project_id === projectId)),
    enabled: !!projectId,
  });

  const { data: allBidSubmissions = [] } = useQuery({
    queryKey: ['bid-submissions-project', projectId],
    queryFn: () => base44.entities.BidSubmission.list().then(all => all.filter(s =>
      ['approved', 'completed', 'paid'].includes(s.status) &&
      allBidRequests.some(br => br.id === s.bid_request_id)
    )),
    enabled: !!projectId && allBidRequests.length > 0,
  });

  const { data: allChangeOrders = [] } = useQuery({
    queryKey: ['change-orders-project', projectId],
    queryFn: () => base44.entities.ChangeOrder.list().then(all => all.filter(co =>
      allBidRequests.some(br => br.id === co.bid_request_id)
    )),
    enabled: !!projectId && allBidRequests.length > 0,
  });

  const estimate = useMemo(() => {
    const approved = estimates.find(e => e.status === 'approved');
    return approved || estimates[0] || null;
  }, [estimates]);

  const estimated = useMemo(() => {
    if (!estimate) return { labor: 0, materials: 0, subcontractor: 0 };
    const totals = { labor: 0, materials: 0, subcontractor: 0 };
    (estimate.sections || []).forEach(section => {
      (section.line_items || []).forEach(item => {
        const cat = item.category;
        if (cat && totals[cat] !== undefined) {
          totals[cat] += item.line_total || 0;
        }
      });
    });
    return totals;
  }, [estimate]);

  const actualMaterials = useMemo(() => {
    return expenses
      .filter(e => bucketOf(e) !== 'subcontractor')
      .reduce((sum, e) => sum + (e.total_amount || 0), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, catBucket]);

  // Subcontractor actual = paid expenses + accepted bid amounts (including change orders)
  const actualSubcontractor = useMemo(() => {
    const paidExpenses = expenses
      .filter(e => bucketOf(e) === 'subcontractor')
      .reduce((sum, e) => sum + (e.total_amount || 0), 0);

    const acceptedBids = allBidSubmissions.reduce((sum, sub) => {
      const bidAmt = sub.bid_amount || 0;
      const coAmt = allChangeOrders
        .filter(co => co.bid_submission_id === sub.id)
        .reduce((s, co) => s + (Number(co.amount) || 0), 0);
      return sum + bidAmt + coAmt;
    }, 0);

    return paidExpenses + acceptedBids;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, allBidSubmissions, allChangeOrders, catBucket]);

  const actualLabor = useMemo(() => {
    return timeEntries.reduce((sum, entry) => {
      if (!entry.duration_minutes) return sum;                       // only completed, timed entries
      if (MANAGEMENT_ROLES.includes(entry.user_role)) return sum;    // salaried mgmt, not hourly labor
      const profile = userProfiles.find(u => u.user_id === entry.user_id);
      const wage = profile?.hourly_wage || 0;
      return sum + (entry.duration_minutes / 60) * wage;
    }, 0);
  }, [timeEntries, userProfiles]);

  const combinedLaborSubEstimated = estimated.labor + estimated.subcontractor;
  const combinedLaborSubActual = actualLabor + actualSubcontractor;

  const rows = [
    {
      key: 'labor-sub',
      label: 'Labor & Subcontractors',
      estimated: combinedLaborSubEstimated,
      actual: combinedLaborSubActual,
    },
    {
      key: 'materials',
      label: 'Materials',
      estimated: estimated.materials,
      actual: actualMaterials,
    },
  ];

  const chartData = [
    {
      name: 'Labor & Sub',
      'Est. Labor': Math.round(estimated.labor),
      'Est. Sub': Math.round(estimated.subcontractor),
      'Actual Labor': Math.round(actualLabor),
      'Actual Sub': Math.round(actualSubcontractor),
      'Estimated Materials': 0,
      'Actual Materials': 0,
    },
    {
      name: 'Materials',
      'Est. Labor': 0,
      'Est. Sub': 0,
      'Actual Labor': 0,
      'Actual Sub': 0,
      'Estimated Materials': Math.round(estimated.materials),
      'Actual Materials': Math.round(actualMaterials),
    },
  ];

  return (
    <div className="space-y-6">
      {!estimate && (
        <div className="text-sm text-muted-foreground bg-muted/40 rounded-lg p-4 text-center">
          No estimate linked to this project. Create an estimate and link it to see financial comparisons.
        </div>
      )}

      {/* Summary Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Category</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Estimated</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actual</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Variance</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const variance = row.actual - row.estimated;
              const isOver = variance > 0;
              const isZero = row.estimated === 0 && row.actual === 0;
              return (
                <tr key={row.key} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{row.label}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(row.estimated)}</td>
                  <td className="px-4 py-3 text-right">{fmt(row.actual)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${isOver ? 'text-red-600' : 'text-emerald-600'} ${isZero ? 'text-muted-foreground' : ''}`}>
                    {isZero ? '' : (isOver ? '+' : '') + fmt(variance)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {isZero ? (
                      <span className="text-muted-foreground text-xs">N/A</span>
                    ) : isOver ? (
                      <span className="inline-flex items-center gap-1 text-xs text-red-600 font-medium">
                        <TrendingUp className="w-3.5 h-3.5" /> Over
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                        <TrendingDown className="w-3.5 h-3.5" /> Under
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      </div>

      {/* Bar Chart */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-1 text-foreground">Estimated vs. Actual</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Labor &amp; subcontractor costs are combined. Subcontractor actual includes accepted bids (approved, completed, or paid).
        </p>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%" barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }} />
            <Legend formatter={name => SERIES_LABELS[name] || name} />
            {/* Estimated stacked: labor + sub + materials */}
            <Bar dataKey="Est. Labor" stackId="estimated" fill="#B58A45" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Est. Sub" stackId="estimated" fill="#355848" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Estimated Materials" stackId="estimated" fill="#6B4B32" radius={[4, 4, 0, 0]} />
            {/* Actual stacked: labor + sub + materials (lighter tints of the same hues) */}
            <Bar dataKey="Actual Labor" stackId="actual" fill="#D8C39A" radius={[0, 0, 0, 0]} />
            <Bar dataKey="Actual Sub" stackId="actual" fill="#7FA394" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Actual Materials" stackId="actual" fill="#A88968" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {estimate && (
        <p className="text-xs text-muted-foreground">
          Estimates pulled from: <strong>{estimate.title}</strong> ({estimate.estimate_number || estimate.status}).
          Labor actuals = hourly crew's logged hours × their wage (salaried management is excluded). Set wages under Settings, Users. Subcontractor actuals include accepted bids and paid expenses.
        </p>
      )}
    </div>
  );
}
