import { useState } from 'react';
import { base44, supabase } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrentUser } from '@/lib/UserContext';
import { format, startOfWeek, endOfWeek, parseISO, addDays } from 'date-fns';
import { findOverlap } from '@/lib/timeEntries';
import { Clock, ChevronLeft, ChevronRight, Pencil, CheckCircle2, XCircle, AlertCircle, UserCheck, LogOut, Trash2, PlusCircle, Download } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ClockedInNow from '@/components/timeclock/ClockedInNow';
import AddMissingTimecardDialog from '@/components/timeclock/AddMissingTimecardDialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const HIGH_ROLES = ['owner', 'coo', 'admin'];
const MANAGER_ROLES = ['owner', 'coo', 'admin', 'site_manager'];

function formatDuration(mins) {
  if (!mins && mins !== 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function WeekNav({ weekStart, onPrev, onNext }) {
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" onClick={onPrev}><ChevronLeft className="w-4 h-4" /></Button>
      <span className="text-sm font-medium text-foreground min-w-[180px] text-center">
        {format(weekStart, 'MMM d')} - {format(weekEnd, 'MMM d, yyyy')}
      </span>
      <Button variant="outline" size="icon" onClick={onNext}><ChevronRight className="w-4 h-4" /></Button>
    </div>
  );
}

export default function Timecards() {
  const { currentUser } = useCurrentUser();
  const queryClient = useQueryClient();
  const isHighRole = HIGH_ROLES.includes(currentUser?.role);
  const isManager = MANAGER_ROLES.includes(currentUser?.role);
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [adjustEntry, setAdjustEntry] = useState(null);
  const [adjustForm, setAdjustForm] = useState({ clock_in: '', clock_out: '', reason: '' });
  const [submittingAdjust, setSubmittingAdjust] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState(currentUser?.id || '');
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '' });
  const [editError, setEditError] = useState('');
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [showAddMissing, setShowAddMissing] = useState(false);
  const [exportingGusto, setExportingGusto] = useState(false);

  // Build the Gusto hours-import CSV client-side, matching Gusto's template exactly. One row per
  // HOURLY employee (salaried excluded, as in Gusto's export); worked hours split into Regular
  // (first 40) and Overtime (over 40) per the Missouri/federal weekly rule; 4-decimal hours.
  const handleGustoExport = () => {
    setExportingGusto(true);
    try {
      const minsByUser = {};
      allEntries.forEach(e => {
        if (!e.duration_minutes) return; // skip open shifts
        const p = userProfiles.find(u => u.user_id === e.user_id);
        if (p?.pay_type === 'salary') return; // salaried people are not on the hours import
        minsByUser[e.user_id] = (minsByUser[e.user_id] || 0) + Number(e.duration_minutes);
      });
      const rows = Object.entries(minsByUser).map(([uid, mins]) => {
        const p = userProfiles.find(u => u.user_id === uid) || {};
        const first = p.first_name || (p.full_name || '').split(' ')[0] || '';
        const last = p.last_name || (p.full_name || '').split(' ').slice(1).join(' ') || '';
        const hours = mins / 60;
        const regular = Math.min(hours, 40);
        const overtime = Math.max(0, hours - 40);
        return { first, last, regular: regular.toFixed(4), overtime: overtime.toFixed(4) };
      })
        .filter(r => r.first || r.last)
        .sort((a, b) => `${a.last}${a.first}`.localeCompare(`${b.last}${b.first}`));

      const header = 'last_name,first_name,ssn,title,regular_hours,overtime_hours,double_overtime_hours,bonus,commission,paycheck_tips,cash_tips,correction_payment,reimbursement,personal_note';
      const lines = rows.map(r => `${r.last},${r.first},,,${r.regular},${r.overtime},0,0,0,0,0,0,0,`);
      const csv = [header, ...lines].join('\n');

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gusto_${weekStartStr}_${weekEndStr}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingGusto(false);
    }
  };

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
  const weekStartStr = format(weekStart, 'yyyy-MM-dd');
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['time-entries', weekStartStr, weekEndStr, isHighRole ? 'all' : currentUser?.id],
    queryFn: async () => {
      // Filter by the selected week server-side so older weeks aren't cut off by a row limit.
      let q = supabase.from('time_entries').select('*')
        .gte('date', weekStartStr).lte('date', weekEndStr)
        .order('date', { ascending: false });
      if (!isHighRole) q = q.eq('user_id', currentUser.id);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
    enabled: !!currentUser,
  });

  const { data: adjustments = [], refetch: refetchAdjustments } = useQuery({
    queryKey: ['timecard-adjustments'],
    queryFn: () => base44.entities.TimecardAdjustment.list('-created_date', 200),
    enabled: !!currentUser,
  });

  const { data: userProfiles = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: () => base44.entities.UserProfile.list(),
    enabled: isHighRole,
  });

  // My entries for the week
  const myEntries = allEntries.filter(e => e.user_id === currentUser?.id);

  // All entries grouped by user (for high roles)
  const allUsers = [...new Set(allEntries.map(e => e.user_id))];
  const userMap = Object.fromEntries(userProfiles.map(u => [u.user_id, u]));

  const pendingAdjustments = adjustments.filter(a => a.status === 'pending');
  const myAdjustments = adjustments.filter(a => a.user_id === currentUser?.id);

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const openAdjust = (entry) => {
    setAdjustEntry(entry);
    setAdjustForm({
      clock_in: entry.clock_in ? format(new Date(entry.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      clock_out: entry.clock_out ? format(new Date(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      reason: '',
    });
  };

  const submitAdjustment = async () => {
    // Guard against rapid double-taps: the dialog only closes after the insert resolves,
    // so without this a burst of taps each fired a full create (5-12 duplicate requests).
    if (submittingAdjust) return;
    setSubmittingAdjust(true);
    const entry = adjustEntry;
    setAdjustEntry(null); // close immediately so no further taps land on this request
    try {
      await base44.entities.TimecardAdjustment.create({
        time_entry_id: entry.id,
        user_id: currentUser.id,
        user_name: currentUser.full_name || currentUser.email,
        project_id: entry.project_id,
        project_name: entry.project_name,
        date: entry.date,
        original_clock_in: entry.clock_in,
        original_clock_out: entry.clock_out,
        requested_clock_in: adjustForm.clock_in ? new Date(adjustForm.clock_in).toISOString() : entry.clock_in,
        requested_clock_out: adjustForm.clock_out ? new Date(adjustForm.clock_out).toISOString() : entry.clock_out,
        reason: adjustForm.reason,
        status: 'pending',
      });
      queryClient.invalidateQueries({ queryKey: ['timecard-adjustments'] });
    } catch (err) {
      alert('Could not submit the adjustment. Please try again.');
      setAdjustEntry(entry); // reopen so the request is not lost
    } finally {
      setSubmittingAdjust(false);
    }
  };

  const approveAdjustment = async (adj) => {
    const newClockin = new Date(adj.requested_clock_in);
    const newClockout = new Date(adj.requested_clock_out);
    const duration_minutes = Math.round((newClockout - newClockin) / 60000);
    await base44.entities.TimeEntry.update(adj.time_entry_id, {
      clock_in: adj.requested_clock_in,
      clock_out: adj.requested_clock_out,
      duration_minutes,
    });
    await base44.entities.TimecardAdjustment.update(adj.id, {
      status: 'approved',
      reviewed_by: currentUser?.full_name || currentUser?.email,
    });
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    queryClient.invalidateQueries({ queryKey: ['timecard-adjustments'] });
  };

  const declineAdjustment = async (adj) => {
    await base44.entities.TimecardAdjustment.update(adj.id, {
      status: 'declined',
      reviewed_by: currentUser?.full_name || currentUser?.email,
    });
    queryClient.invalidateQueries({ queryKey: ['timecard-adjustments'] });
  };

  const manualClockOut = async (entry) => {
    const now = new Date();
    const clockInTime = new Date(entry.clock_in);
    let totalMs = now - clockInTime;
    if (entry.break_start && entry.break_end) {
      totalMs -= (new Date(entry.break_end) - new Date(entry.break_start));
    }
    const duration_minutes = Math.round(totalMs / 60000);
    await base44.entities.TimeEntry.update(entry.id, {
      clock_out: now.toISOString(),
      duration_minutes,
      status: 'clocked_out',
    });
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
  };

  const openEdit = (entry) => {
    setEditEntry(entry);
    setEditError('');
    setEditForm({
      clock_in: entry.clock_in ? format(new Date(entry.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      clock_out: entry.clock_out ? format(new Date(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
    });
  };

  const saveEdit = async () => {
    setEditError('');
    const newIn = editForm.clock_in ? new Date(editForm.clock_in).toISOString() : editEntry.clock_in;
    const newOut = editForm.clock_out ? new Date(editForm.clock_out).toISOString() : editEntry.clock_out;

    // Don't let an edit overlap another entry this person already has that day.
    const dayEntries = await base44.entities.TimeEntry.filter({ user_id: editEntry.user_id, date: editEntry.date });
    const conflict = findOverlap(dayEntries, editEntry.user_id, newIn, newOut, editEntry.id);
    if (conflict) {
      const cin = conflict.clock_in ? format(new Date(conflict.clock_in), 'h:mm a') : '?';
      const cout = conflict.clock_out ? format(new Date(conflict.clock_out), 'h:mm a') : 'open';
      setEditError(`These times overlap another entry that day (${cin} to ${cout}). Adjust them or edit that entry.`);
      return;
    }

    const duration_minutes = newOut ? Math.round((new Date(newOut) - new Date(newIn)) / 60000) : undefined;
    await base44.entities.TimeEntry.update(editEntry.id, {
      clock_in: newIn,
      clock_out: newOut || undefined,
      duration_minutes,
      status: newOut ? 'clocked_out' : editEntry.status,
    });
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setEditEntry(null);
  };

  const confirmDelete = async () => {
    await base44.entities.TimeEntry.delete(deleteEntry.id);
    queryClient.invalidateQueries({ queryKey: ['time-entries'] });
    setDeleteEntry(null);
  };

  // Approved adjustments for current user, add delta (requested - original) to weekly total
  const myApprovedAdjustments = adjustments.filter(a => a.user_id === currentUser?.id && a.status === 'approved');
  const adjustmentDeltaMinutes = myApprovedAdjustments.reduce((sum, a) => {
    const requestedDuration = a.requested_clock_in && a.requested_clock_out
      ? Math.round((new Date(a.requested_clock_out) - new Date(a.requested_clock_in)) / 60000)
      : 0;
    const originalDuration = a.original_clock_in && a.original_clock_out
      ? Math.round((new Date(a.original_clock_out) - new Date(a.original_clock_in)) / 60000)
      : 0;
    return sum + (requestedDuration - originalDuration);
  }, 0);

  const totalMinutes = myEntries.reduce((sum, e) => sum + (e.duration_minutes || 0), 0);

  return (
    <div className="p-6 md:p-8 max-w-5xl mx-auto space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-foreground flex items-center gap-2">
            <Clock className="w-7 h-7 text-accent" /> Timecards
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isHighRole ? 'Manage all crew timecards' : 'Your weekly time card'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isHighRole && (
            <>
              <Button size="sm" onClick={() => setShowAddMissing(true)} className="gap-1.5 w-full sm:w-auto">
                <PlusCircle className="w-4 h-4" /> Add Missing Timecard
              </Button>
              <Button size="sm" variant="outline" onClick={handleGustoExport} disabled={exportingGusto} className="gap-1.5 w-full sm:w-auto">
                <Download className="w-4 h-4" />
                <span className="sm:hidden">{exportingGusto ? 'Exporting...' : 'Export CSV'}</span>
                <span className="hidden sm:inline">{exportingGusto ? 'Exporting...' : 'Export Gusto CSV'}</span>
              </Button>
            </>
          )}
          <div className="w-full sm:w-auto flex justify-center">
            <WeekNav
              weekStart={weekStart}
              onPrev={() => setWeekStart(d => addDays(d, -7))}
              onNext={() => setWeekStart(d => addDays(d, 7))}
            />
          </div>
        </div>
      </div>

      {/* Currently Clocked In, high roles only */}
      {isHighRole && (
        <ClockedInNow
          isManager={isHighRole}
          onEdit={openEdit}
          onDelete={setDeleteEntry}
          onClockOut={manualClockOut}
        />
      )}

      {/* Pending Adjustments, high roles only */}
      {isHighRole && pendingAdjustments.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Timecard Adjustment Requests
            <Badge className="bg-amber-100 text-amber-700 border-0">{pendingAdjustments.length}</Badge>
          </h2>
          <div className="space-y-3">
            {pendingAdjustments.map(adj => {
            const isAutoClockout = adj.reason?.startsWith('AUTO:');
            return (
            <div key={adj.id} className={`bg-card rounded-xl p-4 border ${isAutoClockout ? 'border-red-300 bg-red-50/30' : 'border-amber-200'}`}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{adj.user_name}</p>
                    {isAutoClockout && <Badge className="bg-red-100 text-red-700 border-0 text-xs">Auto Clock-Out</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">{adj.project_name} · {format(parseISO(adj.date + 'T12:00:00'), 'EEEE, MMM d')}</p>
                    <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                      <p>Original: {adj.original_clock_in ? format(new Date(adj.original_clock_in), 'h:mm a') : ''} → {adj.original_clock_out ? format(new Date(adj.original_clock_out), 'h:mm a') : ''}</p>
                      <p className="text-foreground font-medium">Requested: {adj.requested_clock_in ? format(new Date(adj.requested_clock_in), 'h:mm a') : ''} → {adj.requested_clock_out ? format(new Date(adj.requested_clock_out), 'h:mm a') : ''}</p>
                      {adj.reason && <p className="italic">Reason: {adj.reason}</p>}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => approveAdjustment(adj)} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => declineAdjustment(adj)} className="text-red-600 border-red-200">
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Decline
                    </Button>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        </div>
      )}

      {/* My Weekly Timecard */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-foreground">
            {isHighRole ? 'My Timecard' : 'This Week'}
          </h2>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Total: <span className="font-semibold text-foreground">{formatDuration(totalMinutes)}</span></span>
            {adjustmentDeltaMinutes !== 0 && (
              <span className={adjustmentDeltaMinutes > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                Adjustments: {adjustmentDeltaMinutes > 0 ? '+' : ''}{formatDuration(Math.abs(adjustmentDeltaMinutes))}
              </span>
            )}
          </div>
        </div>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Project</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Clock In</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Clock Out</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground"></th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">Loading...</td></tr>
                ) : myEntries.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No entries this week</td></tr>
                ) : (
                  myEntries.map(entry => {
                   const pendingAdj = myAdjustments.find(a => a.time_entry_id === entry.id && a.status === 'pending');
                   return (
                     <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                       <td className="px-3 py-3 text-foreground font-medium text-xs sm:text-sm whitespace-nowrap">
                         {format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}
                       </td>
                       <td className="px-3 py-3 text-muted-foreground text-xs sm:text-sm max-w-[100px] truncate">{entry.project_name}</td>
                       <td className="px-3 py-3 text-xs sm:text-sm whitespace-nowrap">{entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : ''}</td>
                       <td className="px-3 py-3 text-xs sm:text-sm whitespace-nowrap">
                         {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : (
                           <span className="text-emerald-600 font-medium text-xs">Active</span>
                         )}
                       </td>
                       <td className="px-3 py-3 font-medium text-xs sm:text-sm whitespace-nowrap">{formatDuration(entry.duration_minutes)}</td>
                       <td className="px-3 py-3">
                         {isHighRole ? (
                           <div className="flex items-center gap-1">
                             {!entry.clock_out && (
                               <Button size="sm" variant="outline" onClick={() => manualClockOut(entry)} className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50">
                                 <LogOut className="w-3 h-3" />
                               </Button>
                             )}
                             <Button size="sm" variant="ghost" onClick={() => openEdit(entry)} className="h-7 w-7 p-0">
                               <Pencil className="w-3 h-3" />
                             </Button>
                             <Button size="sm" variant="ghost" onClick={() => setDeleteEntry(entry)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50">
                               <Trash2 className="w-3 h-3" />
                             </Button>
                           </div>
                         ) : (
                           <>
                             {entry.clock_out && !pendingAdj && (
                               <Button size="sm" variant="ghost" onClick={() => openAdjust(entry)} className="h-7 px-2 text-xs">
                                 <Pencil className="w-3 h-3 mr-1" /> Edit
                               </Button>
                             )}
                             {pendingAdj && (
                               <Badge className="bg-amber-100 text-amber-700 border-0 text-xs whitespace-nowrap">Pending</Badge>
                             )}
                           </>
                         )}
                       </td>
                     </tr>
                   );
                  })
                )}
              </tbody>
            </table>
          </div>
          {/* Mobile: stacked cards */}
          <div className="md:hidden divide-y divide-border">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
            ) : myEntries.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">No entries this week</div>
            ) : myEntries.map(entry => {
              const pendingAdj = myAdjustments.find(a => a.time_entry_id === entry.id && a.status === 'pending');
              return (
                <div key={entry.id} className="p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-foreground">{format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}</span>
                    <span className="font-semibold text-sm text-foreground whitespace-nowrap">{formatDuration(entry.duration_minutes)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.project_name || 'No project'}</div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <div className="text-xs text-foreground">
                      {entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : '—'}
                      <span className="text-muted-foreground"> to </span>
                      {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                    </div>
                    <div className="shrink-0">
                      {isHighRole ? (
                        <div className="flex items-center gap-1">
                          {!entry.clock_out && (
                            <Button size="sm" variant="outline" onClick={() => manualClockOut(entry)} className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50"><LogOut className="w-3 h-3" /></Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => openEdit(entry)} className="h-7 w-7 p-0"><Pencil className="w-3 h-3" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteEntry(entry)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-3 h-3" /></Button>
                        </div>
                      ) : (
                        <>
                          {entry.clock_out && !pendingAdj && (
                            <Button size="sm" variant="ghost" onClick={() => openAdjust(entry)} className="h-7 px-2 text-xs"><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                          )}
                          {pendingAdj && <Badge className="bg-amber-100 text-amber-700 border-0 text-xs whitespace-nowrap">Pending</Badge>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* All Users Timecard, high roles */}
      {isHighRole && (
        <div>
          <h2 className="text-base font-semibold text-foreground mb-3">All Crew Timecards This Week</h2>
          {allUsers.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No time entries this week</div>
          ) : (
            <div className="space-y-4">
              {allUsers.map(uid => {
                const userEntries = allEntries.filter(e => e.user_id === uid);
                const profile = userMap[uid];
                const name = userEntries[0]?.user_name || profile?.full_name || uid;
                const total = userEntries.reduce((s, e) => s + (e.duration_minutes || 0), 0);
                return (
                  <div key={uid} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium text-foreground">{name}</span>
                        <span className="text-xs text-muted-foreground capitalize">{profile?.role?.replace('_', ' ')}</span>
                      </div>
                      <span className="text-sm font-semibold text-foreground">{formatDuration(total)}</span>
                    </div>
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {userEntries.map(entry => (
                            <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-2.5 font-medium">{format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}</td>
                              <td className="px-4 py-2.5 text-muted-foreground">{entry.project_name}</td>
                              <td className="px-4 py-2.5">{entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : ''}</td>
                              <td className="px-4 py-2.5">{entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : <span className="text-emerald-600 text-xs font-medium">Active</span>}</td>
                              <td className="px-4 py-2.5 font-medium">{formatDuration(entry.duration_minutes)}</td>
                              <td className="px-4 py-2.5">
                                {entry.location_verified && <span className="text-xs text-emerald-600">✓ GPS</span>}
                                {entry.location_overridden && <span className="text-xs text-blue-600">Manual</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-1">
                                  {!entry.clock_out && (
                                    <Button size="sm" variant="outline" onClick={() => manualClockOut(entry)} className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50">
                                      <LogOut className="w-3 h-3 mr-1" /> Clock Out
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => openEdit(entry)} className="h-7 px-2">
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button size="sm" variant="ghost" onClick={() => setDeleteEntry(entry)} className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50">
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Mobile: stacked cards */}
                    <div className="md:hidden divide-y divide-border">
                      {userEntries.map(entry => (
                        <div key={entry.id} className="p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm text-foreground">{format(parseISO(entry.date + 'T12:00:00'), 'EEE, MMM d')}</span>
                            <span className="font-semibold text-sm text-foreground whitespace-nowrap">{formatDuration(entry.duration_minutes)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">{entry.project_name || 'No project'}</div>
                          <div className="flex items-center justify-between gap-2 mt-1.5">
                            <div className="text-xs text-foreground">
                              {entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : '—'}
                              <span className="text-muted-foreground"> to </span>
                              {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                              {entry.location_verified && <span className="ml-1.5 text-emerald-600">✓ GPS</span>}
                              {entry.location_overridden && <span className="ml-1.5 text-blue-600">Manual</span>}
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {!entry.clock_out && (
                                <Button size="sm" variant="outline" onClick={() => manualClockOut(entry)} className="h-7 px-2 text-red-600 border-red-200 hover:bg-red-50"><LogOut className="w-3 h-3" /></Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => openEdit(entry)} className="h-7 w-7 p-0"><Pencil className="w-3 h-3" /></Button>
                              <Button size="sm" variant="ghost" onClick={() => setDeleteEntry(entry)} className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"><Trash2 className="w-3 h-3" /></Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manager Edit Dialog */}
      <Dialog open={!!editEntry} onOpenChange={() => setEditEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Timecard</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Editing <span className="font-medium text-foreground">{editEntry?.user_name}</span>, {editEntry?.project_name} on {editEntry?.date ? format(parseISO(editEntry.date + 'T12:00:00'), 'EEEE, MMM d') : ''}
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Clock In</Label>
                <Input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm(f => ({ ...f, clock_in: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Clock Out</Label>
                <Input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm(f => ({ ...f, clock_out: e.target.value }))} />
              </div>
            </div>
            {editError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{editError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={saveEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteEntry} onOpenChange={() => setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Timecard Entry?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the time entry for <strong>{deleteEntry?.user_name}</strong> on <strong>{deleteEntry?.date ? format(parseISO(deleteEntry.date + 'T12:00:00'), 'EEEE, MMM d') : ''}</strong> ({deleteEntry?.project_name}). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Missing Timecard Dialog */}
      <AddMissingTimecardDialog
        open={showAddMissing}
        onOpenChange={setShowAddMissing}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ['time-entries'] })}
      />

      {/* Adjust Dialog */}
      <Dialog open={!!adjustEntry} onOpenChange={() => setAdjustEntry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Timecard Adjustment</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Submit a correction for <span className="font-medium text-foreground">{adjustEntry?.project_name}</span> on {adjustEntry?.date ? format(parseISO(adjustEntry.date + 'T12:00:00'), 'EEEE, MMM d') : ''}. A manager will review this request.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Clock In</Label>
                <Input type="datetime-local" value={adjustForm.clock_in} onChange={e => setAdjustForm(f => ({ ...f, clock_in: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Clock Out</Label>
                <Input type="datetime-local" value={adjustForm.clock_out} onChange={e => setAdjustForm(f => ({ ...f, clock_out: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Reason for adjustment</Label>
              <Input placeholder="e.g. Forgot to clock out..." value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustEntry(null)}>Cancel</Button>
            <Button onClick={submitAdjustment} disabled={!adjustForm.reason || submittingAdjust}>{submittingAdjust ? 'Submitting...' : 'Submit Request'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}