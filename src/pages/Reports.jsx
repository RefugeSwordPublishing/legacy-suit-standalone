import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '@/lib/UserContext';
import { BarChart2, AlertTriangle } from 'lucide-react';
import { ratesByUser, rateOnDate, rateForMonth, hourlyAmount, monthlyAmount } from '@/lib/payRates';

const HIGH_ROLES = ['owner', 'coo', 'admin'];
const MANAGEMENT_ROLES = ['owner', 'coo', 'admin', 'site_manager'];

function fmt(n) {
  return `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const REPORTS = [
  { key: 'job_costing', label: 'Job Costing', ready: true },
  { key: 'budget_actual', label: 'Budget vs Actual', ready: true },
  { key: 'labor', label: 'Labor', ready: true },
  { key: 'expenses', label: 'Expenses vs Billed', ready: true },
  { key: 'schedule', label: 'Schedule (Est vs Actual)', ready: true },
  { key: 'profitability', label: 'Profitability (after salary)', ready: true },
];

function monthOf(d) {
  if (!d || typeof d !== 'string' || d.length < 7) return null;
  const m = d.slice(0, 7);
  return /^\d{4}-\d{2}$/.test(m) ? m : null;
}

const hrs = (n) => `${Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 1 })}h`;
const parseDay = (s) => { if (!s) return null; const d = new Date(typeof s === 'string' ? s.slice(0, 10) : s); return isNaN(d) ? null : d; };
const daysBetween = (a, b) => { const da = parseDay(a), db = parseDay(b); if (!da || !db) return null; return Math.round((db - da) / 86400000); };
const shortDate = (s) => { const d = parseDay(s); return d ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }) : '-'; };
const todayISO = () => new Date().toISOString().slice(0, 10);

// Start date (inclusive, ISO) for a labor-period preset, or null for all-time.
function periodStart(preset) {
  const now = new Date();
  if (preset === 'month') return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  if (preset === 'year') return `${now.getFullYear()}-01-01`;
  if (preset === '30d') { const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30); return d.toISOString().slice(0, 10); }
  return null;
}

function ProfitabilityReport() {
  const { data: invoices = [] } = useQuery({ queryKey: ['invoices'], queryFn: () => base44.entities.Invoice.list('-issue_date', 2000) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => base44.entities.Expense.list('-created_date', 5000) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 5000) });
  const { data: userProfiles = [] } = useQuery({ queryKey: ['user-profiles'], queryFn: () => base44.entities.UserProfile.list() });
  const { data: payRates = [] } = useQuery({ queryKey: ['pay-rates'], queryFn: () => base44.entities.PayRate.list('-effective_date', 3000) });

  const rateMap = useMemo(() => ratesByUser(userProfiles, payRates), [userProfiles, payRates]);
  const userIds = useMemo(() => userProfiles.map(u => u.user_id).filter(Boolean), [userProfiles]);

  // Salaried monthly overhead for a given month, summed across everyone salaried that month.
  const salaryForMonth = (monthKey) => userIds.reduce((s, uid) => {
    const r = rateForMonth(rateMap[uid], monthKey);
    return s + (r && r.pay_type === 'salary' ? monthlyAmount(r) : 0);
  }, 0);
  // Hourly labor cost for one entry, at the rate in force on its date. Salaried time contributes
  // nothing here (their cost is the fixed monthly overhead).
  const laborForEntry = (t) => {
    const r = rateOnDate(rateMap[t.user_id], t.date);
    if (!r || r.pay_type !== 'hourly') return 0;
    return (t.duration_minutes / 60) * hourlyAmount(r);
  };

  const currentMonthKey = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();
  const monthlySalary = salaryForMonth(currentMonthKey);
  const salariedCount = userIds.filter(uid => {
    const r = rateForMonth(rateMap[uid], currentMonthKey);
    return r && r.pay_type === 'salary' && r.amount;
  }).length;

  const months = useMemo(() => {
    const now = new Date();
    const out = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleString('en-US', { month: 'short' }) + (d.getMonth() === 0 ? ` '${String(d.getFullYear()).slice(2)}` : ''),
      });
    }
    return out;
  }, []);

  const rows = useMemo(() => {
    return months.map(m => {
      const revenue = invoices
        .filter(i => (i.status === 'sent' || i.status === 'paid') && monthOf(i.issue_date) === m.key)
        .reduce((s, i) => s + (i.grand_total || 0), 0);
      const exp = expenses
        .filter(e => (monthOf(e.date) || monthOf(e.created_date)) === m.key)
        .reduce((s, e) => s + (e.total_amount || 0), 0);
      const labor = timeEntries
        .filter(t => monthOf(t.date) === m.key && t.duration_minutes)
        .reduce((s, t) => s + laborForEntry(t), 0);
      const salary = salaryForMonth(m.key);
      const profit = revenue - exp - labor - salary;
      return { ...m, revenue, exp, labor, salary, profit };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months, invoices, expenses, timeEntries, userProfiles, rateMap]);

  const totals = rows.reduce((t, r) => ({
    revenue: t.revenue + r.revenue,
    cost: t.cost + r.exp + r.labor + r.salary,
    profit: t.profit + r.profit,
  }), { revenue: 0, cost: 0, profit: 0 });

  const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.profit)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Revenue (12 mo)</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totals.revenue)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total cost</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totals.cost)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Net profit</p>
          <p className={`text-2xl font-bold mt-1 ${totals.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(totals.profit)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Salary / mo</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(monthlySalary)}</p>
        </div>
      </div>

      {salariedCount === 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          No salaried team members set yet. Set a person's pay type to Salary on the Users page to fold their pay into monthly overhead here.
        </div>
      )}

      <div className="bg-card border border-border rounded-lg p-4">
        <p className="text-sm font-medium text-foreground mb-3">Monthly profit after salary</p>
        <div className="flex items-end gap-1.5 h-40">
          {rows.map(r => {
            const h = Math.round((Math.abs(r.profit) / maxAbs) * 100);
            return (
              <div key={r.key} className="flex-1 flex flex-col items-center justify-end h-full gap-1" title={`${r.label}: ${fmt(r.profit)}`}>
                <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                  <div
                    className={`w-full rounded-t ${r.profit >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
                    style={{ height: `${Math.max(h, r.profit !== 0 ? 3 : 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">{r.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Month</th>
                <th className="text-right px-4 py-2.5 font-medium">Revenue</th>
                <th className="text-right px-4 py-2.5 font-medium">Expenses</th>
                <th className="text-right px-4 py-2.5 font-medium">Labor</th>
                <th className="text-right px-4 py-2.5 font-medium">Salary</th>
                <th className="text-right px-4 py-2.5 font-medium">Profit</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.revenue)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.exp)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.labor)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.salary)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Revenue = invoices marked sent or paid, by issue month. Cost = expenses + hourly labor + salaried overhead. Each person's pay uses the rate in force that month, so raises and pay changes show up from their effective date forward. Set pay and effective dates on the Users page.</p>
    </div>
  );
}

function JobCostingReport() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list('name', 500) });
  const { data: estimates = [] } = useQuery({ queryKey: ['estimates'], queryFn: () => base44.entities.Estimate.list('-created_date', 1000) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => base44.entities.Expense.list('-created_date', 2000) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 5000) });
  const { data: userProfiles = [] } = useQuery({ queryKey: ['user-profiles'], queryFn: () => base44.entities.UserProfile.list() });
  const { data: expenseCats = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => base44.entities.ExpenseCategory.list('sort_order', 200) });
  const { data: payRates = [] } = useQuery({ queryKey: ['pay-rates'], queryFn: () => base44.entities.PayRate.list('-effective_date', 3000) });

  const catBucket = useMemo(() => {
    const m = {};
    expenseCats.forEach(c => { m[(c.name || '').toLowerCase()] = c.cost_bucket; });
    return m;
  }, [expenseCats]);
  const bucketOf = (e) => catBucket[(e.expense_category || '').toLowerCase()] || (e.expense_category === 'subcontractor' ? 'subcontractor' : 'materials');
  const rateMap = useMemo(() => ratesByUser(userProfiles, payRates), [userProfiles, payRates]);
  // Hourly rate in force on the entry's date (so past work costs its historical wage).
  const wageOnDate = (uid, dateStr) => hourlyAmount(rateOnDate(rateMap[uid], dateStr));

  const rows = useMemo(() => {
    return projects.map(p => {
      const est = estimates.find(e => e.project_id === p.id && e.status === 'approved') || estimates.find(e => e.project_id === p.id);
      const estimated = est?.grand_total || p.budget || 0;

      const projExpenses = expenses.filter(e => e.project_id === p.id);
      const materials = projExpenses.filter(e => bucketOf(e) !== 'subcontractor').reduce((s, e) => s + (e.total_amount || 0), 0);
      const subs = projExpenses.filter(e => bucketOf(e) === 'subcontractor').reduce((s, e) => s + (e.total_amount || 0), 0);

      const labor = timeEntries
        .filter(t => t.project_id === p.id && t.duration_minutes && !MANAGEMENT_ROLES.includes(t.user_role))
        .reduce((s, t) => s + (t.duration_minutes / 60) * wageOnDate(t.user_id, t.date), 0);

      const actual = materials + subs + labor;
      const variance = actual - estimated;
      const margin = estimated > 0 ? ((estimated - actual) / estimated) * 100 : null;
      return { id: p.id, name: p.name, status: p.status, estimated, labor, materials, subs, actual, variance, margin };
    }).filter(r => r.estimated > 0 || r.actual > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, estimates, expenses, timeEntries, userProfiles, catBucket, rateMap]);

  const totals = rows.reduce((t, r) => ({ estimated: t.estimated + r.estimated, actual: t.actual + r.actual }), { estimated: 0, actual: 0 });
  const totalMargin = totals.estimated > 0 ? ((totals.estimated - totals.actual) / totals.estimated) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Estimated</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totals.estimated)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Actual cost</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totals.actual)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Est. margin</p>
          <p className={`text-2xl font-bold mt-1 ${totalMargin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{totalMargin != null ? `${totalMargin.toFixed(1)}%` : '-'}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Project</th>
                <th className="text-right px-4 py-2.5 font-medium">Estimated</th>
                <th className="text-right px-4 py-2.5 font-medium">Labor</th>
                <th className="text-right px-4 py-2.5 font-medium">Materials</th>
                <th className="text-right px-4 py-2.5 font-medium">Subs</th>
                <th className="text-right px-4 py-2.5 font-medium">Actual</th>
                <th className="text-right px-4 py-2.5 font-medium">Margin</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No projects with estimates or costs yet.</td></tr>}
              {rows.map(r => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.estimated)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.labor)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.materials)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.subs)}</td>
                  <td className="px-4 py-3 text-right font-medium text-foreground">{fmt(r.actual)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.margin == null ? 'text-muted-foreground' : r.margin >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.margin != null ? `${r.margin.toFixed(1)}%` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Estimated = approved estimate total (or project budget). Actual = hourly crew labor + materials + subcontractor costs. Labor is priced at each worker's wage in effect on the day the hours were logged, so past raises are reflected. Salaried management is excluded (that lands in the Profitability report).</p>
    </div>
  );
}

function BudgetActualReport() {
  const [scope, setScope] = useState('all'); // 'all' or a project id
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list('name', 500) });
  const { data: estimates = [] } = useQuery({ queryKey: ['estimates'], queryFn: () => base44.entities.Estimate.list('-created_date', 1000) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => base44.entities.Expense.list('-created_date', 2000) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 5000) });
  const { data: userProfiles = [] } = useQuery({ queryKey: ['user-profiles'], queryFn: () => base44.entities.UserProfile.list() });
  const { data: expenseCats = [] } = useQuery({ queryKey: ['expense-categories'], queryFn: () => base44.entities.ExpenseCategory.list('sort_order', 200) });
  const { data: payRates = [] } = useQuery({ queryKey: ['pay-rates'], queryFn: () => base44.entities.PayRate.list('-effective_date', 3000) });

  const catBucket = useMemo(() => {
    const m = {};
    expenseCats.forEach(c => { m[(c.name || '').toLowerCase()] = c.cost_bucket; });
    return m;
  }, [expenseCats]);
  const bucketOf = (e) => catBucket[(e.expense_category || '').toLowerCase()] || (e.expense_category === 'subcontractor' ? 'subcontractor' : 'materials');
  const rateMap = useMemo(() => ratesByUser(userProfiles, payRates), [userProfiles, payRates]);
  const wageOnDate = (uid, dateStr) => hourlyAmount(rateOnDate(rateMap[uid], dateStr));

  const inScope = (pid) => scope === 'all' || pid === scope;

  const data = useMemo(() => {
    // Estimated budget by bucket, from each project's approved (or first) estimate line items.
    const est = { labor: 0, materials: 0, subcontractor: 0 };
    projects.filter(p => inScope(p.id)).forEach(p => {
      const e = estimates.find(x => x.project_id === p.id && x.status === 'approved') || estimates.find(x => x.project_id === p.id);
      if (!e) return;
      (e.sections || []).forEach(section => {
        (section.line_items || []).forEach(item => {
          if (est[item.category] !== undefined) est[item.category] += item.line_total || 0;
        });
      });
    });

    // Actual by bucket.
    const act = { labor: 0, materials: 0, subcontractor: 0 };
    expenses.filter(e => inScope(e.project_id)).forEach(e => {
      const b = bucketOf(e) === 'subcontractor' ? 'subcontractor' : 'materials';
      act[b] += e.total_amount || 0;
    });
    timeEntries
      .filter(t => inScope(t.project_id) && t.duration_minutes && !MANAGEMENT_ROLES.includes(t.user_role))
      .forEach(t => { act.labor += (t.duration_minutes / 60) * wageOnDate(t.user_id, t.date); });

    // Actual expenses broken out by their own category name (finer than bucket).
    const byCategory = {};
    expenses.filter(e => inScope(e.project_id)).forEach(e => {
      const name = e.expense_category || 'Uncategorized';
      byCategory[name] = (byCategory[name] || 0) + (e.total_amount || 0);
    });

    return { est, act, byCategory };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects, estimates, expenses, timeEntries, userProfiles, catBucket, rateMap, scope]);

  const CATS = [
    { key: 'labor', label: 'Labor' },
    { key: 'materials', label: 'Materials' },
    { key: 'subcontractor', label: 'Subcontractor' },
  ];
  const rows = CATS.map(c => {
    const budget = data.est[c.key] || 0;
    const actual = data.act[c.key] || 0;
    const variance = actual - budget;
    const pct = budget > 0 ? (actual / budget) * 100 : null;
    return { ...c, budget, actual, variance, pct };
  });
  const totalBudget = rows.reduce((s, r) => s + r.budget, 0);
  const totalActual = rows.reduce((s, r) => s + r.actual, 0);
  const totalVariance = totalActual - totalBudget;
  const totalPct = totalBudget > 0 ? (totalActual / totalBudget) * 100 : null;

  const catRows = Object.entries(data.byCategory).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Scope</span>
        <select
          value={scope}
          onChange={e => setScope(e.target.value)}
          className="h-9 rounded-md border border-border bg-card px-3 text-sm text-foreground"
        >
          <option value="all">All projects</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Budget</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totalBudget)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Actual</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totalActual)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Variance</p>
          <p className={`text-2xl font-bold mt-1 ${totalVariance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {totalVariance > 0 ? '+' : ''}{fmt(totalVariance)}{totalPct != null ? ` · ${totalPct.toFixed(0)}%` : ''}
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-muted-foreground">
                <th className="text-left px-4 py-2.5 font-medium">Category</th>
                <th className="text-right px-4 py-2.5 font-medium">Budget</th>
                <th className="text-right px-4 py-2.5 font-medium">Actual</th>
                <th className="text-right px-4 py-2.5 font-medium">Variance</th>
                <th className="text-right px-4 py-2.5 font-medium">% of budget</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium text-foreground">{r.label}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.budget)}</td>
                  <td className="px-4 py-3 text-right text-foreground">{fmt(r.actual)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${r.variance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {r.budget === 0 && r.actual === 0 ? '-' : `${r.variance > 0 ? '+' : ''}${fmt(r.variance)}`}
                  </td>
                  <td className={`px-4 py-3 text-right ${r.pct == null ? 'text-muted-foreground' : r.pct > 100 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {r.pct != null ? `${r.pct.toFixed(0)}%` : '-'}
                  </td>
                </tr>
              ))}
              <tr className="bg-muted/20 font-medium">
                <td className="px-4 py-3 text-foreground">Total</td>
                <td className="px-4 py-3 text-right">{fmt(totalBudget)}</td>
                <td className="px-4 py-3 text-right">{fmt(totalActual)}</td>
                <td className={`px-4 py-3 text-right ${totalVariance <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {totalBudget === 0 && totalActual === 0 ? '-' : `${totalVariance > 0 ? '+' : ''}${fmt(totalVariance)}`}
                </td>
                <td className={`px-4 py-3 text-right ${totalPct != null && totalPct > 100 ? 'text-red-600' : 'text-muted-foreground'}`}>
                  {totalPct != null ? `${totalPct.toFixed(0)}%` : '-'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {catRows.length > 0 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border bg-muted/30">
            <p className="text-sm font-medium text-foreground">Actual spend by expense category</p>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {catRows.map(([name, amt]) => (
                <tr key={name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                  <td className="px-4 py-2.5 text-foreground capitalize">{name}</td>
                  <td className="px-4 py-2.5 text-right text-muted-foreground">{fmt(amt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Budget = estimate line items grouped by their category (labor / materials / subcontractor), from each project's approved estimate. Actual labor = hourly crew hours at the wage in effect on each day (salaried management excluded); actual materials and subcontractor come from logged expenses. A category with actual over budget shows red.
      </p>
    </div>
  );
}

function LaborReport() {
  const [preset, setPreset] = useState('30d');
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list('name', 500) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 5000) });
  const { data: userProfiles = [] } = useQuery({ queryKey: ['user-profiles'], queryFn: () => base44.entities.UserProfile.list() });
  const { data: payRates = [] } = useQuery({ queryKey: ['pay-rates'], queryFn: () => base44.entities.PayRate.list('-effective_date', 3000) });

  const rateMap = useMemo(() => ratesByUser(userProfiles, payRates), [userProfiles, payRates]);
  const start = periodStart(preset);
  const nameOf = (uid) => { const u = userProfiles.find(x => x.user_id === uid); return u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unknown') : 'Unknown'; };

  const entries = useMemo(
    () => timeEntries.filter(t => t.duration_minutes && (!start || (t.date && t.date >= start))),
    [timeEntries, start]
  );

  const byPerson = useMemo(() => {
    const m = {};
    entries.forEach(t => {
      const rate = rateOnDate(rateMap[t.user_id], t.date);
      const isHourly = !rate || rate.pay_type === 'hourly';
      const key = t.user_id || 'unknown';
      m[key] = m[key] || { uid: t.user_id, name: nameOf(t.user_id), hours: 0, cost: 0, hourly: isHourly };
      const h = t.duration_minutes / 60;
      m[key].hours += h;
      if (isHourly) m[key].cost += h * hourlyAmount(rate);
    });
    return Object.values(m).sort((a, b) => b.hours - a.hours);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, rateMap]);

  const byProject = useMemo(() => {
    const m = {};
    entries.forEach(t => {
      const rate = rateOnDate(rateMap[t.user_id], t.date);
      const cost = (!rate || rate.pay_type === 'hourly') ? (t.duration_minutes / 60) * hourlyAmount(rate) : 0;
      const key = t.project_id || 'none';
      const name = projects.find(p => p.id === t.project_id)?.name || 'Unassigned';
      m[key] = m[key] || { name, hours: 0, cost: 0 };
      m[key].hours += t.duration_minutes / 60;
      m[key].cost += cost;
    });
    return Object.values(m).sort((a, b) => b.cost - a.cost);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, rateMap, projects]);

  const totalHours = byPerson.reduce((s, r) => s + r.hours, 0);
  const totalCost = byPerson.reduce((s, r) => s + r.cost, 0);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 flex-wrap">
        {[['30d', 'Last 30 days'], ['month', 'This month'], ['year', 'This year'], ['all', 'All time']].map(([v, label]) => (
          <button key={v} onClick={() => setPreset(v)} className={`px-3 py-1.5 rounded-md text-sm border transition-all ${preset === v ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-accent/50'}`}>{label}</button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Hours logged</p>
          <p className="text-2xl font-bold text-foreground mt-1">{hrs(totalHours)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Labor cost</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(totalCost)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">People</p>
          <p className="text-2xl font-bold text-foreground mt-1">{byPerson.length}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30"><p className="text-sm font-medium text-foreground">By person</p></div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
          <thead><tr className="border-b border-border text-muted-foreground">
            <th className="text-left px-4 py-2.5 font-medium">Person</th>
            <th className="text-right px-4 py-2.5 font-medium">Hours</th>
            <th className="text-right px-4 py-2.5 font-medium">Cost</th>
          </tr></thead>
          <tbody>
            {byPerson.length === 0 && <tr><td colSpan={3} className="text-center py-8 text-muted-foreground">No hours logged in this period.</td></tr>}
            {byPerson.map(r => (
              <tr key={r.uid || r.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}{!r.hourly && <span className="ml-1.5 text-xs text-muted-foreground">(salaried)</span>}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{hrs(r.hours)}</td>
                <td className="px-4 py-3 text-right text-foreground">{r.hourly ? fmt(r.cost) : '-'}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border bg-muted/30"><p className="text-sm font-medium text-foreground">By project</p></div>
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[520px]">
          <thead><tr className="border-b border-border text-muted-foreground">
            <th className="text-left px-4 py-2.5 font-medium">Project</th>
            <th className="text-right px-4 py-2.5 font-medium">Hours</th>
            <th className="text-right px-4 py-2.5 font-medium">Cost</th>
          </tr></thead>
          <tbody>
            {byProject.map(r => (
              <tr key={r.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{hrs(r.hours)}</td>
                <td className="px-4 py-3 text-right text-foreground">{fmt(r.cost)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <p className="text-xs text-muted-foreground">Hours come from completed time entries. Cost = hours at each person's wage in effect on the day worked. Salaried people show hours but no hourly cost (their pay is fixed monthly overhead in the Profitability report).</p>
    </div>
  );
}

function ExpensesBilledReport() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list('name', 500) });
  const { data: expenses = [] } = useQuery({ queryKey: ['expenses'], queryFn: () => base44.entities.Expense.list('-created_date', 2000) });

  const rows = useMemo(() => {
    const m = {};
    expenses.forEach(e => {
      const key = e.project_id || 'none';
      const name = projects.find(p => p.id === e.project_id)?.name || e.project_name || 'Unassigned';
      const amt = e.total_amount || 0;
      const billable = e.billable !== false;
      m[key] = m[key] || { name, total: 0, billable: 0, billed: 0, unbilled: 0 };
      m[key].total += amt;
      if (billable) {
        m[key].billable += amt;
        if (e.billed) m[key].billed += amt; else m[key].unbilled += amt;
      }
    });
    return Object.values(m).sort((a, b) => b.unbilled - a.unbilled);
  }, [expenses, projects]);

  const tot = rows.reduce((t, r) => ({ total: t.total + r.total, billable: t.billable + r.billable, billed: t.billed + r.billed, unbilled: t.unbilled + r.unbilled }), { total: 0, billable: 0, billed: 0, unbilled: 0 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Total spent</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(tot.total)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Billable</p>
          <p className="text-2xl font-bold text-foreground mt-1">{fmt(tot.billable)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Billed</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{fmt(tot.billed)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">Unbilled</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{fmt(tot.unbilled)}</p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[640px]">
          <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
            <th className="text-left px-4 py-2.5 font-medium">Project</th>
            <th className="text-right px-4 py-2.5 font-medium">Total</th>
            <th className="text-right px-4 py-2.5 font-medium">Billable</th>
            <th className="text-right px-4 py-2.5 font-medium">Billed</th>
            <th className="text-right px-4 py-2.5 font-medium">Unbilled</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No expenses recorded.</td></tr>}
            {rows.map(r => (
              <tr key={r.name} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.total)}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{fmt(r.billable)}</td>
                <td className="px-4 py-3 text-right text-emerald-600">{fmt(r.billed)}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.unbilled > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>{fmt(r.unbilled)}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <p className="text-xs text-muted-foreground">Billable = expenses flagged to pass through to the client. Unbilled = billable expenses not yet marked billed, so they are reimbursable costs you have not charged for yet. Mark expenses billed when you import them onto an invoice.</p>
    </div>
  );
}

function ScheduleReport() {
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list('name', 500) });
  const { data: timeEntries = [] } = useQuery({ queryKey: ['time-entries-all'], queryFn: () => base44.entities.TimeEntry.list('-date', 5000) });

  const lastActivity = useMemo(() => {
    const m = {};
    timeEntries.forEach(t => { if (t.project_id && t.date) { if (!m[t.project_id] || t.date > m[t.project_id]) m[t.project_id] = t.date; } });
    return m;
  }, [timeEntries]);

  const today = todayISO();
  const rows = projects
    .filter(p => p.start_date)
    .map(p => {
      let plannedDays = daysBetween(p.start_date, p.target_end_date);
      if (plannedDays == null && p.duration_value) {
        const unit = p.duration_unit || 'days';
        plannedDays = Math.round(p.duration_value * (unit === 'weeks' ? 7 : unit === 'months' ? 30 : 1));
      }
      const done = p.status === 'completed';
      const actualEnd = done ? (p.completed_date || lastActivity[p.id] || p.target_end_date || today) : today;
      const actualDays = daysBetween(p.start_date, actualEnd);
      const variance = (plannedDays != null && actualDays != null) ? actualDays - plannedDays : null;
      const overdue = !done && p.target_end_date && today > p.target_end_date.slice(0, 10);
      return { id: p.id, name: p.name, status: p.status, start: p.start_date, end: p.target_end_date, plannedDays, actualDays, variance, done, overdue };
    })
    .sort((a, b) => (a.start < b.start ? 1 : -1));

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full text-sm min-w-[760px]">
          <thead><tr className="border-b border-border bg-muted/30 text-muted-foreground">
            <th className="text-left px-4 py-2.5 font-medium">Project</th>
            <th className="text-left px-4 py-2.5 font-medium">Start</th>
            <th className="text-left px-4 py-2.5 font-medium">Target end</th>
            <th className="text-right px-4 py-2.5 font-medium">Planned</th>
            <th className="text-right px-4 py-2.5 font-medium">{`Actual / elapsed`}</th>
            <th className="text-right px-4 py-2.5 font-medium">Variance</th>
            <th className="text-right px-4 py-2.5 font-medium">Status</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No projects with a start date yet.</td></tr>}
            {rows.map(r => (
              <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-muted/20">
                <td className="px-4 py-3 font-medium text-foreground">{r.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{shortDate(r.start)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.end ? shortDate(r.end) : '-'}</td>
                <td className="px-4 py-3 text-right text-muted-foreground">{r.plannedDays != null ? `${r.plannedDays}d` : '-'}</td>
                <td className="px-4 py-3 text-right text-foreground">{r.actualDays != null ? `${r.actualDays}d` : '-'}</td>
                <td className={`px-4 py-3 text-right font-medium ${r.variance == null ? 'text-muted-foreground' : r.variance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {r.variance == null ? '-' : `${r.variance > 0 ? '+' : ''}${r.variance}d`}
                </td>
                <td className="px-4 py-3 text-right">
                  {r.done
                    ? <span className="text-xs text-muted-foreground">Completed</span>
                    : r.overdue
                      ? <span className="text-xs text-red-600 font-medium">Overdue</span>
                      : <span className="text-xs text-emerald-600 font-medium">On track</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <p className="text-xs text-muted-foreground">Planned = start date to target end (or the project's set duration). For active projects, "actual / elapsed" counts days since start and flags overdue past the target end. Completed projects finish on their recorded completion date (older ones were backfilled to their last logged work date). A negative variance means it ran shorter than planned.</p>
    </div>
  );
}

export default function Reports() {
  const { currentUser } = useCurrentUser();
  const [active, setActive] = useState('job_costing');

  if (!HIGH_ROLES.includes(currentUser?.role)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3" />
        <p>You don't have access to this page.</p>
      </div>
    );
  }

  const current = REPORTS.find(r => r.key === active);

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold text-primary flex items-center gap-2">
          <BarChart2 className="w-7 h-7" /> Reports
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Financial and operational insight across your projects.</p>
      </div>

      <div className="flex gap-1 flex-wrap">
        {REPORTS.map(r => (
          <button
            key={r.key}
            onClick={() => setActive(r.key)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-all ${active === r.key ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:border-accent/50'}`}
          >
            {r.label}{!r.ready && <span className="ml-1.5 text-[10px] opacity-70">soon</span>}
          </button>
        ))}
      </div>

      {current?.ready ? (
        <>
          {active === 'job_costing' && <JobCostingReport />}
          {active === 'budget_actual' && <BudgetActualReport />}
          {active === 'labor' && <LaborReport />}
          {active === 'expenses' && <ExpensesBilledReport />}
          {active === 'schedule' && <ScheduleReport />}
          {active === 'profitability' && <ProfitabilityReport />}
        </>
      ) : (
        <div className="bg-card border border-border rounded-lg p-12 text-center text-muted-foreground">
          <p className="font-medium text-foreground mb-1">{current?.label}</p>
          <p className="text-sm">This report is on the way.</p>
        </div>
      )}
    </div>
  );
}
