import { useState, useEffect, useRef } from 'react';
import { supabase, base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { useToast } from '@/components/ui/use-toast';
import { format, parseISO, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { Download, FileText, AlertTriangle, Filter, Settings2, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import {
  computePayroll, buildSummaryCsv, buildDetailCsv, downloadCsv,
  PAYROLL_PRESETS, OVERTIME_MODES, presetLabel,
} from '@/lib/payrollExport';
import SendToGustoDialog from '@/components/gusto/SendToGustoDialog';

const HIGH_ROLES = ['owner', 'coo', 'admin'];
const WEEK_DAYS = [
  { v: 0, l: 'Sunday' }, { v: 1, l: 'Monday' }, { v: 2, l: 'Tuesday' }, { v: 3, l: 'Wednesday' },
  { v: 4, l: 'Thursday' }, { v: 5, l: 'Friday' }, { v: 6, l: 'Saturday' },
];

function formatDuration(mins) {
  if (!mins && mins !== 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function TimecardReport() {
  const { currentUser } = useCurrentUser();
  const { toast } = useToast();
  const today = new Date();
  const [startDate, setStartDate] = useState(format(startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfWeek(subWeeks(today, 1), { weekStartsOn: 1 }), 'yyyy-MM-dd'));
  // Set once the user edits either date, so loading settings cannot overwrite their choice.
  const datesTouchedRef = useRef(false);
  const [filterProject, setFilterProject] = useState('all');
  const [filterUser, setFilterUser] = useState('all');

  // Per-tenant payroll export settings.
  const [companyId, setCompanyId] = useState(null);
  const [preset, setPreset] = useState('generic');
  const [overtimeMode, setOvertimeMode] = useState('weekly_40');
  const [weekStart, setWeekStart] = useState(0);
  const [includePay, setIncludePay] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: cs } = await supabase.from('company_settings')
          .select('company_id, payroll_export_preset, payroll_overtime_mode, payroll_week_start, payroll_include_pay')
          .maybeSingle();
        if (cs) {
          setCompanyId(cs.company_id);
          setPreset(cs.payroll_export_preset || 'generic');
          setOvertimeMode(cs.payroll_overtime_mode || 'weekly_40');
          const ws = cs.payroll_week_start ?? 1;
          setWeekStart(ws);
          if (!datesTouchedRef.current) {
            const base = subWeeks(new Date(), 1);
            setStartDate(format(startOfWeek(base, { weekStartsOn: ws }), 'yyyy-MM-dd'));
            setEndDate(format(endOfWeek(base, { weekStartsOn: ws }), 'yyyy-MM-dd'));
          }
          setIncludePay(cs.payroll_include_pay ?? false);
        } else {
          const companies = await base44.entities.Company.list();
          setCompanyId(companies?.[0]?.id || null);
        }
      } catch { /* ignore, defaults stand */ }
    })();
  }, []);

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['time-entries-report'],
    queryFn: () => base44.entities.TimeEntry.list('-date', 1000),
  });
  const { data: projects = [] } = useQuery({ queryKey: ['projects'], queryFn: () => base44.entities.Project.list() });
  const { data: userProfiles = [] } = useQuery({ queryKey: ['user-profiles'], queryFn: () => base44.entities.UserProfile.list() });
  const { data: payRates = [] } = useQuery({ queryKey: ['pay-rates'], queryFn: () => base44.entities.PayRate.list() });
  const { data: adjustments = [] } = useQuery({ queryKey: ['timecard-adjustments'], queryFn: () => base44.entities.TimecardAdjustment.list('-date', 500) });
  const { data: gustoSettings } = useQuery({ queryKey: ['gusto-settings'], queryFn: async () => (await base44.functions.invoke('gustoAuth', { action: 'get_settings' }))?.data?.settings || null });
  const gustoConnected = gustoSettings?.is_connected === true;
  const [showGusto, setShowGusto] = useState(false);

  if (!HIGH_ROLES.includes(currentUser?.role)) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3" />
        <p>You don't have access to this page.</p>
      </div>
    );
  }

  const filteredEntries = allEntries.filter(e => {
    if (e.date < startDate || e.date > endDate) return false;
    if (filterProject !== 'all' && e.project_id !== filterProject) return false;
    if (filterUser !== 'all' && e.user_id !== filterUser) return false;
    return e.status === 'clocked_out';
  });

  const totalMinutes = filteredEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);

  const profilesById = Object.fromEntries(userProfiles.map(u => [u.user_id, u]));

  // Current hourly rate: the pay_rates row in force on the period end, else the profile wage.
  const rateFor = (userId) => {
    const rows = payRates
      .filter(r => r.user_id === userId && r.pay_type === 'hourly' && r.effective_date <= endDate)
      .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
    if (rows.length) return Number(rows[0].amount) || 0;
    return Number(profilesById[userId]?.hourly_wage) || 0;
  };

  const payrollRows = computePayroll(filteredEntries, { overtimeMode, weekStart });
  const ratesByUser = Object.fromEntries([...new Set(filteredEntries.map(e => e.user_id))].map(id => [id, rateFor(id)]));

  const pendingInRange = adjustments.filter(a => a.status === 'pending' && a.date >= startDate && a.date <= endDate).length;

  const saveSettings = async () => {
    if (!companyId) return;
    setSavingSettings(true);
    try {
      const { error } = await supabase.from('company_settings').upsert({
        company_id: companyId,
        payroll_export_preset: preset,
        payroll_overtime_mode: overtimeMode,
        payroll_week_start: Number(weekStart),
        payroll_include_pay: includePay,
      }, { onConflict: 'company_id' });
      if (error) throw error;
      toast({ title: 'Payroll settings saved' });
    } catch (e) {
      toast({ title: 'Could not save', description: e.message, variant: 'destructive' });
    } finally { setSavingSettings(false); }
  };

  const exportSummary = () => {
    const csv = buildSummaryCsv(payrollRows, { preset, includePay, profilesById, ratesByUser });
    downloadCsv(`payroll_${preset}_${startDate}_${endDate}.csv`, csv);
  };
  const exportDetail = () => {
    const csv = buildDetailCsv(filteredEntries, { profilesById });
    downloadCsv(`timecards_${startDate}_${endDate}.csv`, csv);
  };

  const noData = filteredEntries.length === 0;

  return (
    <div className="p-6 md:p-8 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <FileText className="w-7 h-7 text-accent" /> Timecard Report
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Export approved hours for payroll, in your provider's format.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(s => !s)} className="gap-1.5">
            <Settings2 className="w-4 h-4" /> Export settings
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={noData} className="gap-1.5">
                <Download className="w-4 h-4" /> Export <ChevronDown className="w-3.5 h-3.5 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onClick={exportSummary} className="flex flex-col items-start gap-0.5">
                <span className="font-medium">Payroll summary ({presetLabel(preset)})</span>
                <span className="text-xs text-muted-foreground">One row per employee, regular and overtime hours.</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportDetail} className="flex flex-col items-start gap-0.5">
                <span className="font-medium">Detailed entries</span>
                <span className="text-xs text-muted-foreground">Every clock entry, for records or generic import.</span>
              </DropdownMenuItem>
              {gustoConnected && (
                <DropdownMenuItem onClick={() => setShowGusto(true)} className="flex flex-col items-start gap-0.5">
                  <span className="font-medium">Send to Gusto payroll</span>
                  <span className="text-xs text-muted-foreground">Push regular and overtime hours onto an open payroll.</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Export settings */}
      {showSettings && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Payroll provider</Label>
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYROLL_PRESETS.map(p => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PAYROLL_PRESETS.find(p => p.key === preset)?.note}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Overtime</Label>
              <Select value={overtimeMode} onValueChange={setOvertimeMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OVERTIME_MODES.map(m => <SelectItem key={m.key} value={m.key}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{OVERTIME_MODES.find(m => m.key === overtimeMode)?.note}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Workweek starts</Label>
              <Select value={String(weekStart)} onValueChange={(v) => setWeekStart(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WEEK_DAYS.map(d => <SelectItem key={d.v} value={String(d.v)}>{d.l}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">The day your workweek begins. Sets the timecard week, the Gusto export period, and the 7-day window for overtime.</p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border pt-4">
            <div>
              <p className="text-sm font-medium">Include pay columns</p>
              <p className="text-xs text-muted-foreground">Add hourly rate and gross pay to the Generic export. Provider exports report hours only.</p>
            </div>
            <Switch checked={includePay} onCheckedChange={setIncludePay} />
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveSettings} disabled={savingSettings || !companyId} className="gap-2">
              {savingSettings && <Loader2 className="w-4 h-4 animate-spin" />} Save as default
            </Button>
          </div>
          {(preset === 'adp' || preset === 'paychex') && (
            <p className="text-xs text-muted-foreground border-t border-border pt-3">
              {presetLabel(preset)} keys on an employee id. Set each worker's payroll id on the Users &amp; Wages page; blank ids export with the name only.
            </p>
          )}
        </div>
      )}

      {pendingInRange > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            {pendingInRange} correction {pendingInRange === 1 ? 'request is' : 'requests are'} still pending in this range. Approve or decline them so hours are final before you export.
          </p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Filter className="w-4 h-4" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => { datesTouchedRef.current = true; setStartDate(e.target.value); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => { datesTouchedRef.current = true; setEndDate(e.target.value); }} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Project</Label>
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Projects</SelectItem>
                {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Employee</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Employees</SelectItem>
                {userProfiles.map(u => <SelectItem key={u.user_id} value={u.user_id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{payrollRows.length}</p>
          <p className="text-xs text-muted-foreground">Employees</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{formatDuration(totalMinutes)}</p>
          <p className="text-xs text-muted-foreground">Total Hours</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{payrollRows.reduce((s, r) => s + r.overtimeHours, 0).toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Overtime Hours</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-2xl font-bold text-foreground">{filteredEntries.length}</p>
          <p className="text-xs text-muted-foreground">Entries</p>
        </div>
      </div>

      {/* Payroll summary, per employee */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Payroll summary <span className="text-muted-foreground font-normal">· regular and overtime by {OVERTIME_MODES.find(m => m.key === overtimeMode)?.label.toLowerCase()}</span></h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Regular</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Overtime</th>
                  <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  {includePay && <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Gross</th>}
                </tr>
              </thead>
              <tbody>
                {noData ? (
                  <tr><td colSpan={includePay ? 5 : 4} className="text-center py-8 text-muted-foreground">No entries match your filters</td></tr>
                ) : (
                  payrollRows.map(r => (
                    <tr key={r.userId} className="border-b border-border last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.userName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.regularHours.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{r.overtimeHours > 0 ? <span className="text-amber-600 font-medium">{r.overtimeHours.toFixed(2)}</span> : '0.00'}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium">{r.totalHours.toFixed(2)}</td>
                      {includePay && <td className="px-4 py-2.5 text-right tabular-nums">${(r.regularHours * (ratesByUser[r.userId] || 0) + r.overtimeHours * (ratesByUser[r.userId] || 0) * 1.5).toFixed(2)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detailed entries */}
      <div>
        <h2 className="text-sm font-semibold text-foreground mb-2">Entries</h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Employee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Clock In</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Clock Out</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">GPS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : noData ? (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No entries match your filters</td></tr>
                ) : (
                  filteredEntries.map(entry => (
                    <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">{format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}</td>
                      <td className="px-4 py-3">{entry.user_name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{entry.project_name}</td>
                      <td className="px-4 py-3">{entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : ''}</td>
                      <td className="px-4 py-3">{entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : ''}</td>
                      <td className="px-4 py-3 font-medium">{formatDuration(entry.duration_minutes)}</td>
                      <td className="px-4 py-3 text-xs">
                        {entry.location_verified ? <span className="text-emerald-600">Verified</span> : entry.location_overridden ? <span className="text-blue-600">Manual</span> : <span className="text-muted-foreground">-</span>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <SendToGustoDialog open={showGusto} onOpenChange={setShowGusto} payrollRows={payrollRows} profilesById={profilesById} />
    </div>
  );
}
