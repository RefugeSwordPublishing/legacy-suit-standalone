'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { format, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronLeft, ChevronRight, Clock, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle, Plus, Download, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import ClockWidget from './ClockWidget'

const HIGH_ROLES = ['owner', 'coo', 'admin']
const MANAGER_ROLES = ['owner', 'coo', 'admin', 'site_manager']

function fmt(mins: number | null) {
  if (!mins && mins !== 0) return '—'
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export default function TimecardsPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [weekStart, setWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [adjustEntry, setAdjustEntry] = useState<any>(null)
  const [adjustForm, setAdjustForm] = useState({ clock_in: '', clock_out: '', reason: '' })
  const [editEntry, setEditEntry] = useState<any>(null)
  const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '' })
  const [deleteEntry, setDeleteEntry] = useState<any>(null)
  const [selectedUserId, setSelectedUserId] = useState<string>('')

  const isHighRole = HIGH_ROLES.includes(currentUser?.role ?? '')
  const isManager = MANAGER_ROLES.includes(currentUser?.role ?? '')

  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 })
  const weekStartStr = format(weekStart, 'yyyy-MM-dd')
  const weekEndStr = format(weekEnd, 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase.from('projects').select('id, name, status').order('name')
      return data ?? []
    },
  })

  const { data: allEntries = [], isLoading } = useQuery({
    queryKey: ['time-entries', weekStartStr, weekEndStr],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('*')
        .gte('date', weekStartStr)
        .lte('date', weekEndStr)
        .order('clock_in', { ascending: false })
      return data ?? []
    },
    enabled: !!currentUser,
  })

  const { data: adjustments = [] } = useQuery({
    queryKey: ['timecard-adjustments'],
    queryFn: async () => {
      const { data } = await supabase.from('timecard_adjustments').select('*').order('created_at', { ascending: false })
      return data ?? []
    },
    enabled: !!currentUser,
  })

  const { data: userProfiles = [] } = useQuery({
    queryKey: ['user-profiles'],
    queryFn: async () => {
      const { data } = await supabase.from('user_profiles').select('*')
      return data ?? []
    },
    enabled: isHighRole,
  })

  const myEntries = allEntries.filter((e: any) => e.user_id === currentUser?.user_id)
  const viewingUserId = isHighRole && selectedUserId ? selectedUserId : currentUser?.user_id
  const viewingEntries = allEntries.filter((e: any) => e.user_id === viewingUserId)
  const pendingAdjustments = adjustments.filter((a: any) => a.status === 'pending')

  const totalMins = viewingEntries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)

  const entriesForDay = (dayStr: string) =>
    viewingEntries.filter((e: any) => e.date === dayStr)

  const openAdjust = (entry: any) => {
    setAdjustEntry(entry)
    setAdjustForm({
      clock_in: entry.clock_in ? format(new Date(entry.clock_in), "yyyy-MM-dd'T'HH:mm") : '',
      clock_out: entry.clock_out ? format(new Date(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '',
      reason: '',
    })
  }

  const submitAdjustment = async () => {
    if (!currentUser || !adjustEntry) return
    const myName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email
    await supabase.from('timecard_adjustments').insert({
      time_entry_id: adjustEntry.id,
      user_id: currentUser.user_id,
      status: 'pending',
      requested_clock_in: adjustForm.clock_in ? new Date(adjustForm.clock_in).toISOString() : adjustEntry.clock_in,
      requested_clock_out: adjustForm.clock_out ? new Date(adjustForm.clock_out).toISOString() : adjustEntry.clock_out,
      original_clock_in: adjustEntry.clock_in,
      original_clock_out: adjustEntry.clock_out,
      reason: adjustForm.reason,
    })
    toast.success('Adjustment request submitted')
    qc.invalidateQueries({ queryKey: ['timecard-adjustments'] })
    setAdjustEntry(null)
  }

  const approveAdjustment = async (adj: any) => {
    const newIn = new Date(adj.requested_clock_in)
    const newOut = new Date(adj.requested_clock_out)
    const duration_minutes = Math.round((newOut.getTime() - newIn.getTime()) / 60000)
    await supabase.from('time_entries').update({
      clock_in: adj.requested_clock_in,
      clock_out: adj.requested_clock_out,
      duration_minutes,
    }).eq('id', adj.time_entry_id)
    await supabase.from('timecard_adjustments').update({ status: 'approved' }).eq('id', adj.id)
    toast.success('Adjustment approved')
    qc.invalidateQueries({ queryKey: ['time-entries', weekStartStr, weekEndStr] })
    qc.invalidateQueries({ queryKey: ['timecard-adjustments'] })
  }

  const declineAdjustment = async (adj: any) => {
    await supabase.from('timecard_adjustments').update({ status: 'declined' }).eq('id', adj.id)
    toast.success('Adjustment declined')
    qc.invalidateQueries({ queryKey: ['timecard-adjustments'] })
  }

  const saveEdit = async () => {
    if (!editEntry) return
    const newIn = editForm.clock_in ? new Date(editForm.clock_in).toISOString() : editEntry.clock_in
    const newOut = editForm.clock_out ? new Date(editForm.clock_out).toISOString() : editEntry.clock_out
    const duration_minutes = newOut ? Math.round((new Date(newOut).getTime() - new Date(newIn).getTime()) / 60000) : null
    await supabase.from('time_entries').update({ clock_in: newIn, clock_out: newOut, duration_minutes, status: newOut ? 'clocked_out' : editEntry.status }).eq('id', editEntry.id)
    toast.success('Entry updated')
    qc.invalidateQueries({ queryKey: ['time-entries', weekStartStr, weekEndStr] })
    setEditEntry(null)
  }

  const confirmDelete = async () => {
    if (!deleteEntry) return
    await supabase.from('time_entries').delete().eq('id', deleteEntry.id)
    toast.success('Entry deleted')
    qc.invalidateQueries({ queryKey: ['time-entries', weekStartStr, weekEndStr] })
    setDeleteEntry(null)
  }

  const exportCSV = () => {
    const rows = [['Name', 'Project', 'Date', 'Clock In', 'Clock Out', 'Hours']]
    viewingEntries.forEach((e: any) => {
      rows.push([
        e.user_name ?? '',
        e.project_name ?? '',
        e.date ?? '',
        e.clock_in ? format(new Date(e.clock_in), 'h:mm a') : '',
        e.clock_out ? format(new Date(e.clock_out), 'h:mm a') : '',
        e.duration_minutes ? (e.duration_minutes / 60).toFixed(2) : '',
      ])
    })
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `timecards_${weekStartStr}_${weekEndStr}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Timecards</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">Week total: <strong>{fmt(totalMins)}</strong></p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="w-3.5 h-3.5 mr-1" /> Export CSV
        </Button>
      </div>

      {/* Clock Widget */}
      <ClockWidget projects={projects as any} />

      {/* Week nav + user picker */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, -7))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-medium min-w-[180px] text-center">
            {format(weekStart, 'MMM d')} – {format(weekEnd, 'MMM d, yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={() => setWeekStart(d => addDays(d, 7))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        {isHighRole && userProfiles.length > 0 && (
          <Select value={selectedUserId || '__me__'} onValueChange={v => setSelectedUserId(v === '__me__' ? '' : v)}>
            <SelectTrigger className="w-44 h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__me__">My Timecards</SelectItem>
              {userProfiles.map((u: any) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Weekly grid */}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-[#7A7560]" /></div>
      ) : (
        <div className="space-y-2">
          {weekDays.map(day => {
            const dayStr = format(day, 'yyyy-MM-dd')
            const dayEntries = entriesForDay(dayStr)
            const dayMins = dayEntries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0)
            const isToday = dayStr === format(new Date(), 'yyyy-MM-dd')
            return (
              <div key={dayStr} className={`border rounded-xl ${isToday ? 'border-[#3d3d1e]/40 bg-[#3d3d1e]/5' : 'border-[#D4CFBA] bg-[#F7F4EE]'}`}>
                <div className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${isToday ? 'text-[#3d3d1e]' : 'text-[#7A7560]'}`}>
                      {format(day, 'EEE, MMM d')}
                      {isToday && <span className="ml-1.5 text-[10px] text-[#3d3d1e] bg-[#3d3d1e]/10 px-1.5 py-0.5 rounded-full">Today</span>}
                    </span>
                  </div>
                  <span className="text-xs text-[#7A7560] font-medium">{dayMins > 0 ? fmt(dayMins) : '—'}</span>
                </div>
                {dayEntries.length > 0 && (
                  <div className="border-t border-[#D4CFBA] divide-y divide-[#D4CFBA]/50">
                    {dayEntries.map((entry: any) => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2 group">
                        <Clock className="w-3.5 h-3.5 text-[#7A7560] shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[#3d3d1e] truncate">{entry.project_name}</p>
                          <p className="text-xs text-[#7A7560]">
                            {entry.clock_in ? format(new Date(entry.clock_in), 'h:mm a') : '?'}
                            {' → '}
                            {entry.clock_out ? format(new Date(entry.clock_out), 'h:mm a') : <span className="text-emerald-600 font-medium">Active</span>}
                            {entry.duration_minutes ? ` · ${fmt(entry.duration_minutes)}` : ''}
                          </p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!isHighRole && entry.clock_out && (
                            <button onClick={() => openAdjust(entry)} className="p-1 rounded hover:bg-[#D4CFBA] text-[#7A7560]" title="Request adjustment">
                              <Pencil className="w-3 h-3" />
                            </button>
                          )}
                          {isManager && (
                            <>
                              <button onClick={() => { setEditEntry(entry); setEditForm({ clock_in: format(new Date(entry.clock_in), "yyyy-MM-dd'T'HH:mm"), clock_out: entry.clock_out ? format(new Date(entry.clock_out), "yyyy-MM-dd'T'HH:mm") : '' }) }} className="p-1 rounded hover:bg-[#D4CFBA] text-[#7A7560]">
                                <Pencil className="w-3 h-3" />
                              </button>
                              <button onClick={() => setDeleteEntry(entry)} className="p-1 rounded hover:bg-red-100 text-[#7A7560] hover:text-red-600">
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pending adjustments — managers */}
      {isManager && pendingAdjustments.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[#3d3d1e] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-500" />
            Pending Adjustments ({pendingAdjustments.length})
          </h2>
          {pendingAdjustments.map((adj: any) => (
            <div key={adj.id} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-sm space-y-0.5">
                  <p className="font-medium text-[#3d3d1e]">{adj.reason || 'No reason provided'}</p>
                  <p className="text-xs text-[#7A7560]">
                    Requested: {adj.requested_clock_in ? format(new Date(adj.requested_clock_in), 'MMM d, h:mm a') : '?'}
                    {' → '}
                    {adj.requested_clock_out ? format(new Date(adj.requested_clock_out), 'h:mm a') : '?'}
                  </p>
                  <p className="text-xs text-[#7A7560]">
                    Original: {adj.original_clock_in ? format(new Date(adj.original_clock_in), 'h:mm a') : '?'}
                    {' → '}
                    {adj.original_clock_out ? format(new Date(adj.original_clock_out), 'h:mm a') : '?'}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => approveAdjustment(adj)}>
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 border-red-300 text-red-600 hover:bg-red-50" onClick={() => declineAdjustment(adj)}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Decline
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Adjustment request dialog */}
      <Dialog open={!!adjustEntry} onOpenChange={v => !v && setAdjustEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Request Time Adjustment</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Clock In</Label>
              <Input type="datetime-local" value={adjustForm.clock_in} onChange={e => setAdjustForm(f => ({ ...f, clock_in: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Clock Out</Label>
              <Input type="datetime-local" value={adjustForm.clock_out} onChange={e => setAdjustForm(f => ({ ...f, clock_out: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Reason <span className="text-red-500">*</span></Label>
              <Input value={adjustForm.reason} onChange={e => setAdjustForm(f => ({ ...f, reason: e.target.value }))} placeholder="Why does this need adjusting?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustEntry(null)}>Cancel</Button>
            <Button onClick={submitAdjustment} disabled={!adjustForm.reason.trim()} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">Submit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit entry dialog (managers) */}
      <Dialog open={!!editEntry} onOpenChange={v => !v && setEditEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Time Entry</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Clock In</Label>
              <Input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm(f => ({ ...f, clock_in: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Clock Out</Label>
              <Input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm(f => ({ ...f, clock_out: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancel</Button>
            <Button onClick={saveEdit} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteEntry} onOpenChange={v => !v && setDeleteEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete time entry?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
