'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole, type UserProfile } from '@/lib/hooks/useCurrentUser'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Mail, Shield, User, Loader2 } from 'lucide-react'
import { toast } from 'sonner'

const ROLE_COLORS: Record<string, string> = {
  owner:        'bg-[#3d3d1e] text-[#EAE8E1]',
  admin:        'bg-purple-100 text-purple-700',
  coo:          'bg-blue-100 text-blue-700',
  site_manager: 'bg-amber-100 text-amber-700',
  crew_member:  'bg-green-100 text-green-700',
  employee:     'bg-slate-100 text-slate-700',
  client:       'bg-rose-100 text-rose-700',
}

export default function UsersPage() {
  const supabase = createClient()
  const qc = useQueryClient()
  const { data: currentUser } = useCurrentUser()
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('crew_member')
  const [inviteFirst, setInviteFirst] = useState('')
  const [inviteLast, setInviteLast] = useState('')
  const [inviting, setInviting] = useState(false)

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['all-users'],
    queryFn: async () => {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .order('first_name')
      return (data ?? []) as UserProfile[]
    },
    enabled: isHighRole(currentUser?.role),
  })

  if (!isHighRole(currentUser?.role)) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-[#7A7560]">
        <Shield className="w-10 h-10 opacity-30" />
        <p className="font-semibold">Owner or Admin access required</p>
      </div>
    )
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviting(true)

    const { data, error } = await supabase.auth.admin.inviteUserByEmail(inviteEmail, {
      data: { role: inviteRole, first_name: inviteFirst, last_name: inviteLast },
      redirectTo: `${window.location.origin}/auth/callback`,
    })

    if (error) {
      toast.error(error.message)
      setInviting(false)
      return
    }

    // Create the user_profile row immediately so role is set on first login
    if (data.user) {
      await supabase.from('user_profiles').insert({
        user_id: data.user.id,
        email: inviteEmail,
        role: inviteRole,
        first_name: inviteFirst || null,
        last_name: inviteLast || null,
        is_active: true,
      })
    }

    toast.success(`Invite sent to ${inviteEmail}`)
    setInviteEmail('')
    setInviteFirst('')
    setInviteLast('')
    setInviteRole('crew_member')
    setShowInvite(false)
    setInviting(false)
    qc.invalidateQueries({ queryKey: ['all-users'] })
  }

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('id', userId)

    if (error) {
      toast.error('Failed to update role')
      return
    }

    toast.success('Role updated')
    qc.invalidateQueries({ queryKey: ['all-users'] })
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#3d3d1e]">Users</h1>
          <p className="text-sm text-[#7A7560] mt-0.5">Manage team members and client access</p>
        </div>
        <Button
          onClick={() => setShowInvite(v => !v)}
          className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]"
          size="sm"
        >
          <Plus className="w-4 h-4 mr-1" /> Invite User
        </Button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <Card className="mb-6 border-[#D4CFBA]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" /> Invite New User
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleInvite} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>First Name</Label>
                <Input value={inviteFirst} onChange={e => setInviteFirst(e.target.value)} placeholder="First" />
              </div>
              <div className="space-y-1.5">
                <Label>Last Name</Label>
                <Input value={inviteLast} onChange={e => setInviteLast(e.target.value)} placeholder="Last" />
              </div>
              <div className="space-y-1.5">
                <Label>Email <span className="text-red-500">*</span></Label>
                <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@example.com" required />
              </div>
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={inviteRole} onValueChange={setInviteRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="coo">COO</SelectItem>
                    <SelectItem value="site_manager">Site Manager</SelectItem>
                    <SelectItem value="crew_member">Crew Member</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 flex gap-2">
                <Button type="submit" disabled={inviting} className="bg-[#3d3d1e] hover:bg-[#5a5a2a] text-[#EAE8E1]">
                  {inviting ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Sending...</> : 'Send Invite'}
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* User list */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#7A7560]" />
        </div>
      ) : (
        <div className="space-y-2">
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 bg-[#F7F4EE] border border-[#D4CFBA] rounded-lg px-4 py-3">
              <div className="w-8 h-8 rounded-full bg-[#3d3d1e]/10 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-[#3d3d1e]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[#3d3d1e] truncate">
                  {u.first_name || u.last_name ? `${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() : u.email ?? 'Unnamed'}
                </p>
                {u.email && <p className="text-xs text-[#7A7560] truncate">{u.email}</p>}
              </div>
              <Badge className={`text-xs shrink-0 ${ROLE_COLORS[u.role] ?? ''}`}>
                {u.role}
              </Badge>
              {/* Role change — owners only, can't change own role */}
              {currentUser?.role === 'owner' && u.id !== currentUser?.id && (
                <Select value={u.role} onValueChange={role => handleRoleChange(u.id, role)}>
                  <SelectTrigger className="w-36 h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="coo">COO</SelectItem>
                    <SelectItem value="site_manager">Site Manager</SelectItem>
                    <SelectItem value="crew_member">Crew Member</SelectItem>
                    <SelectItem value="employee">Employee</SelectItem>
                    <SelectItem value="client">Client</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
          ))}
          {users.length === 0 && (
            <p className="text-center text-[#7A7560] py-12 text-sm">No users yet. Invite your first team member.</p>
          )}
        </div>
      )}
    </div>
  )
}
