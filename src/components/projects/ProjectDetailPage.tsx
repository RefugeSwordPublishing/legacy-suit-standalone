'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole } from '@/lib/hooks/useCurrentUser'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ArrowLeft, MapPin, User, DollarSign, Pencil, Loader2 } from 'lucide-react'
import Link from 'next/link'
import ProjectFormDialog from './ProjectFormDialog'
import type { Project } from './ProjectsPage'
import { cn } from '@/lib/utils'

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  planning:  { label: 'Planning',  color: 'bg-slate-100 text-slate-600' },
  active:    { label: 'Active',    color: 'bg-green-100 text-green-700' },
  on_hold:   { label: 'On Hold',   color: 'bg-amber-100 text-amber-700' },
  completed: { label: 'Completed', color: 'bg-blue-100 text-blue-700' },
}

const PHASES: Record<string, string> = {
  phase_1: 'Phase 1', phase_2: 'Phase 2', phase_3: 'Phase 3',
  phase_4: 'Phase 4', phase_5: 'Phase 5', phase_6: 'Phase 6',
}

function fmt(n: number | null) {
  if (!n) return '—'
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
}

export default function ProjectDetailPage({ projectId }: { projectId: string }) {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [editOpen, setEditOpen] = useState(false)
  const [tab, setTab] = useState('overview')

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const { data } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()
      return data as Project | null
    },
  })

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6 text-center text-[#7A7560]">
        <p>Project not found.</p>
        <Link href="/dashboard/projects" className="text-[#3d3d1e] underline text-sm mt-2 inline-block">Back to Projects</Link>
      </div>
    )
  }

  const sc = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        <Link href="/dashboard/projects" className="p-2 rounded-lg hover:bg-[#D4CFBA]/50 text-[#7A7560] hover:text-[#3d3d1e] transition-colors mt-0.5">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold text-[#3d3d1e] truncate">{project.name}</h1>
            <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
            {project.phase && (
              <span className="text-xs text-[#7A7560] font-medium">{PHASES[project.phase]}</span>
            )}
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {project.client_name && (
              <span className="flex items-center gap-1 text-xs text-[#7A7560]">
                <User className="w-3 h-3" />{project.client_name}
              </span>
            )}
            {project.address && (
              <span className="flex items-center gap-1 text-xs text-[#7A7560]">
                <MapPin className="w-3 h-3" />{project.address}
              </span>
            )}
            {project.budget && (
              <span className="flex items-center gap-1 text-xs text-[#7A7560]">
                <DollarSign className="w-3 h-3" />Budget: {fmt(project.budget)}
              </span>
            )}
          </div>
        </div>
        {isHighRole(currentUser?.role) && (
          <Button size="sm" variant="outline" onClick={() => setEditOpen(true)} className="shrink-0 h-8">
            <Pencil className="w-3.5 h-3.5 mr-1" /> Edit
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="materials">Materials</TabsTrigger>
          <TabsTrigger value="timecards">Timecards</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-sm text-[#3d3d1e]">Project Info</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[#7A7560]">Status</span>
                  <Badge className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A7560]">Phase</span>
                  <span className="font-medium">{project.phase ? PHASES[project.phase] : '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A7560]">Client</span>
                  <span className="font-medium">{project.client_name ?? '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A7560]">Budget</span>
                  <span className="font-medium">{fmt(project.budget)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A7560]">Address</span>
                  <span className="font-medium text-right max-w-[60%]">{project.address ?? '—'}</span>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="tasks">
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-6 text-center text-[#7A7560]">
            <p className="text-sm">Tasks — coming in a future phase.</p>
          </div>
        </TabsContent>

        <TabsContent value="materials">
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-6 text-center text-[#7A7560]">
            <p className="text-sm">Materials — coming in a future phase.</p>
          </div>
        </TabsContent>

        <TabsContent value="timecards">
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-6 text-center text-[#7A7560]">
            <p className="text-sm">Timecards — coming in a future phase.</p>
          </div>
        </TabsContent>

        <TabsContent value="financials">
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-6 text-center text-[#7A7560]">
            <p className="text-sm">Financials — coming in a future phase.</p>
          </div>
        </TabsContent>

        <TabsContent value="files">
          <div className="bg-[#F7F4EE] border border-[#D4CFBA] rounded-xl p-6 text-center text-[#7A7560]">
            <p className="text-sm">Files — coming in a future phase.</p>
          </div>
        </TabsContent>
      </Tabs>

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={project}
        onSaved={() => {
          setEditOpen(false)
          qc.invalidateQueries({ queryKey: ['project', projectId] })
          qc.invalidateQueries({ queryKey: ['projects'] })
        }}
      />
    </div>
  )
}
