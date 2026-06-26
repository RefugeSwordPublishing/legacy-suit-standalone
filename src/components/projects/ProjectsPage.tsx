'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, FolderKanban, MapPin, User, Loader2 } from 'lucide-react'
import Link from 'next/link'
import ProjectFormDialog from './ProjectFormDialog'
import { cn } from '@/lib/utils'

export interface Project {
  id: string
  name: string
  address: string | null
  client_id: string | null
  client_name: string | null
  status: string
  phase: string | null
  budget: number | null
  quickbooks_project_id: string | null
  assigned_project_ids: string[] | null
  color: string | null
  created_at: string
}

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planning:   { label: 'Planning',   color: 'bg-slate-100 text-slate-600' },
  active:     { label: 'Active',     color: 'bg-green-100 text-green-700' },
  on_hold:    { label: 'On Hold',    color: 'bg-amber-100 text-amber-700' },
  completed:  { label: 'Completed',  color: 'bg-blue-100 text-blue-700' },
}

const STATUS_FILTERS = ['all', 'active', 'planning', 'on_hold', 'completed']

export default function ProjectsPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [showForm, setShowForm] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false })
      return (data ?? []) as Project[]
    },
  })

  const filtered = projects.filter(p => {
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client_name?.toLowerCase().includes(search.toLowerCase()) ||
      p.address?.toLowerCase().includes(search.toLowerCase())
    return matchStatus && matchSearch
  })

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Projects</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">{projects.filter(p => p.status === 'active').length} active</p>
        </div>
        {isHighRole(currentUser?.role) && (
          <Button onClick={() => setShowForm(true)} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]" size="sm">
            <Plus className="w-4 h-4 mr-1" /> New Project
          </Button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map(s => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors border',
              statusFilter === s
                ? 'bg-[#3d3d1e] text-[#EAE8E1] border-[#3d3d1e]'
                : 'bg-[#F7F4EE] text-[#7A7560] border-[#D4CFBA] hover:border-[#3d3d1e]/40'
            )}
          >
            {s === 'all' ? 'All' : STATUS_CONFIG[s]?.label ?? s}
          </button>
        ))}
        <Input
          placeholder="Search projects..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="ml-auto w-48 h-8 text-sm"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-[#7A7560]">
          <FolderKanban className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No projects found.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map(project => {
            const sc = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning
            return (
              <Link key={project.id} href={`/dashboard/projects/${project.id}`}>
                <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 hover:shadow-md hover:border-[#3d3d1e]/30 transition-all cursor-pointer h-full">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {project.color && (
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ background: project.color }} />
                      )}
                      <h3 className="font-semibold text-[#3d3d1e] truncate">{project.name}</h3>
                    </div>
                    <Badge className={`text-[10px] shrink-0 ${sc.color}`}>{sc.label}</Badge>
                  </div>

                  <div className="space-y-1 mt-2">
                    {project.client_name && (
                      <div className="flex items-center gap-1.5 text-xs text-[#7A7560]">
                        <User className="w-3 h-3 shrink-0" />
                        <span className="truncate">{project.client_name}</span>
                      </div>
                    )}
                    {project.address && (
                      <div className="flex items-center gap-1.5 text-xs text-[#7A7560]">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span className="truncate">{project.address}</span>
                      </div>
                    )}
                  </div>

                  {project.phase && (
                    <div className="mt-2">
                      <span className="text-[10px] font-medium text-[#7A7560] uppercase tracking-wider">
                        {project.phase.replace('_', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      <ProjectFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        onSaved={() => {
          setShowForm(false)
          qc.invalidateQueries({ queryKey: ['projects'] })
        }}
      />
    </div>
  )
}
