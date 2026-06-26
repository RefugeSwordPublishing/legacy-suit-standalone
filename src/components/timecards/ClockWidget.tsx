'use client'

import { useState, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Clock, LogIn, LogOut, Coffee, UserCheck, AlertCircle } from 'lucide-react'
import { format } from 'date-fns'
import { toast } from 'sonner'

function ElapsedTimer({ clockIn }: { clockIn: string }) {
  const [elapsed, setElapsed] = useState('')
  useEffect(() => {
    const tick = () => {
      const diff = Math.floor((Date.now() - new Date(clockIn).getTime()) / 1000)
      const h = Math.floor(diff / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      setElapsed(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [clockIn])
  return <span className="font-mono font-semibold text-emerald-700">{elapsed}</span>
}

interface Props {
  projects: { id: string; name: string; status: string }[]
}

const MANAGER_ROLES = ['owner', 'coo', 'admin', 'site_manager']

export default function ClockWidget({ projects }: Props) {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [manualUserId, setManualUserId] = useState('')
  const [loading, setLoading] = useState(false)

  const isManager = MANAGER_ROLES.includes(currentUser?.role ?? '')
  const todayStr = format(new Date(), 'yyyy-MM-dd')

  const { data: activeEntries = [], refetch } = useQuery({
    queryKey: ['time-entries-today', currentUser?.user_id],
    queryFn: async () => {
      const { data } = await supabase
        .from('time_entries')
        .select('*')
        .eq('user_id', currentUser!.user_id)
        .eq('date', todayStr)
      return data ?? []
    },
    enabled: !!currentUser?.user_id,
  })

  const { data: crewMembers = [] } = useQuery({
    queryKey: ['crew-members'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .in('role', ['crew_member', 'site_manager', 'employee'])
        .eq('is_active', true)
      return data ?? []
    },
    enabled: isManager,
  })

  const activeEntry = activeEntries.find((e: any) => e.status === 'clocked_in' || e.status === 'on_break')
  const availableProjects = projects.filter(p => p.status === 'active')

  const handleClockIn = async () => {
    const project = projects.find(p => p.id === selectedProjectId)
    if (!project || !currentUser) return
    setLoading(true)

    const fullName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email

    const { error } = await supabase.from('time_entries').insert({
      user_id: currentUser.user_id,
      user_name: fullName,
      user_role: currentUser.role,
      project_id: project.id,
      project_name: project.name,
      clock_in: new Date().toISOString(),
      date: todayStr,
      status: 'clocked_in',
      location_verified: false,
    })

    if (error) { toast.error('Clock in failed'); setLoading(false); return }
    toast.success(`Clocked in — ${project.name}`)
    await refetch()
    qc.invalidateQueries({ queryKey: ['time-entries'] })
    setLoading(false)
  }

  const handleClockOut = async () => {
    if (!activeEntry) return
    setLoading(true)
    const now = new Date()
    const clockInTime = new Date(activeEntry.clock_in)
    let totalMs = now.getTime() - clockInTime.getTime()
    if (activeEntry.break_start && activeEntry.break_end) {
      totalMs -= new Date(activeEntry.break_end).getTime() - new Date(activeEntry.break_start).getTime()
    } else if (activeEntry.break_start && !activeEntry.break_end) {
      totalMs -= now.getTime() - new Date(activeEntry.break_start).getTime()
    }
    const duration_minutes = Math.round(totalMs / 60000)

    await supabase.from('time_entries').update({
      clock_out: now.toISOString(),
      break_end: activeEntry.status === 'on_break' ? now.toISOString() : activeEntry.break_end,
      duration_minutes,
      status: 'clocked_out',
    }).eq('id', activeEntry.id)

    toast.success('Clocked out')
    await refetch()
    qc.invalidateQueries({ queryKey: ['time-entries'] })
    setLoading(false)
  }

  const handleBreak = async () => {
    if (!activeEntry) return
    setLoading(true)
    if (activeEntry.status === 'on_break') {
      await supabase.from('time_entries').update({ break_end: new Date().toISOString(), status: 'clocked_in' }).eq('id', activeEntry.id)
      toast.success('Break ended')
    } else {
      await supabase.from('time_entries').update({ break_start: new Date().toISOString(), status: 'on_break' }).eq('id', activeEntry.id)
      toast.success('Break started')
    }
    await refetch()
    setLoading(false)
  }

  const handleManualClockIn = async () => {
    const project = projects.find(p => p.id === selectedProjectId)
    const target = crewMembers.find((u: any) => u.user_id === manualUserId)
    if (!project || !target || !currentUser) return
    setLoading(true)

    const myName = [currentUser.first_name, currentUser.last_name].filter(Boolean).join(' ') || currentUser.email

    const { error } = await supabase.from('time_entries').insert({
      user_id: target.user_id,
      user_name: [target.first_name, target.last_name].filter(Boolean).join(' '),
      user_role: target.role,
      project_id: project.id,
      project_name: project.name,
      clock_in: new Date().toISOString(),
      date: todayStr,
      status: 'clocked_in',
      location_verified: false,
      location_overridden: true,
      manually_clocked_by: myName,
    })

    if (error) { toast.error('Manual clock in failed'); setLoading(false); return }
    toast.success(`${target.first_name} clocked in`)
    qc.invalidateQueries({ queryKey: ['time-entries'] })
    setManualUserId('')
    setLoading(false)
  }

  return (
    <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-[#3d3d1e]" />
        <h2 className="text-sm font-semibold text-[#3d3d1e]">Time Clock</h2>
        {activeEntry && (
          <span className={`ml-auto text-xs font-medium px-2 py-0.5 rounded-full ${
            activeEntry.status === 'on_break' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>
            {activeEntry.status === 'on_break' ? '☕ On Break' : '● Clocked In'}
          </span>
        )}
      </div>

      {activeEntry ? (
        <div className="space-y-3">
          <div className="bg-white/60 rounded-lg p-3 space-y-1 border border-[#D4CFBA]">
            <p className="text-xs text-[#7A7560]">Working on: <span className="font-medium text-[#3d3d1e]">{activeEntry.project_name}</span></p>
            <div className="flex items-center gap-1.5 text-xs text-[#7A7560]">
              <Clock className="w-3 h-3" />
              In at {format(new Date(activeEntry.clock_in), 'h:mm a')} · <ElapsedTimer clockIn={activeEntry.clock_in} />
            </div>
            {activeEntry.manually_clocked_by && (
              <p className="text-xs text-blue-600 flex items-center gap-1">
                <UserCheck className="w-3 h-3" /> Clocked by {activeEntry.manually_clocked_by}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button onClick={handleBreak} disabled={loading} variant="outline" size="sm" className="flex-1">
              <Coffee className="w-3.5 h-3.5 mr-1" />
              {activeEntry.status === 'on_break' ? 'End Break' : 'Break (30m)'}
            </Button>
            <Button onClick={handleClockOut} disabled={loading} size="sm" className="flex-1 bg-red-500 hover:bg-red-600 text-white">
              <LogOut className="w-3.5 h-3.5 mr-1" /> Clock Out
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select project...">
                {selectedProjectId
                  ? availableProjects.find(p => p.id === selectedProjectId)?.name ?? 'Select project...'
                  : 'Select project...'}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {availableProjects.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleClockIn}
            disabled={loading || !selectedProjectId}
            className="w-full bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
            size="sm"
          >
            <LogIn className="w-3.5 h-3.5 mr-1" />
            {loading ? 'Clocking in...' : 'Clock In'}
          </Button>
        </div>
      )}

      {isManager && (
        <div className="border-t border-[#D4CFBA] pt-3 space-y-2">
          <p className="text-xs font-medium text-[#7A7560] flex items-center gap-1">
            <UserCheck className="w-3 h-3" /> Manual Clock-In
          </p>
          <Select value={manualUserId} onValueChange={setManualUserId}>
            <SelectTrigger className="text-sm">
              <SelectValue placeholder="Select crew member..." />
            </SelectTrigger>
            <SelectContent>
              {crewMembers.map((u: any) => (
                <SelectItem key={u.user_id} value={u.user_id}>
                  {[u.first_name, u.last_name].filter(Boolean).join(' ') || u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={handleManualClockIn}
            disabled={loading || !manualUserId || !selectedProjectId}
            variant="outline"
            size="sm"
            className="w-full"
          >
            <UserCheck className="w-3.5 h-3.5 mr-1" /> Clock In Employee
          </Button>
        </div>
      )}
    </div>
  )
}
