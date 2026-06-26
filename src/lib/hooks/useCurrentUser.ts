'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'owner' | 'admin' | 'coo' | 'site_manager' | 'crew_member' | 'employee' | 'client'

export interface UserProfile {
  id: string
  user_id: string
  role: UserRole
  first_name: string | null
  last_name: string | null
  email: string | null
  hourly_wage: number | null
  assigned_project_ids: string[] | null
  is_active: boolean
  notify_task_assigned: boolean
  client_id: string | null
}

export function useCurrentUser() {
  const supabase = createClient()

  return useQuery({
    queryKey: ['current-user'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single()

      return profile as UserProfile | null
    },
    staleTime: 1000 * 60 * 5, // 5 min
  })
}

export function isInternalUser(role?: UserRole | null) {
  return role && role !== 'client'
}

export function isHighRole(role?: UserRole | null) {
  return role && ['owner', 'admin', 'coo'].includes(role)
}

export function isClient(role?: UserRole | null) {
  return role === 'client'
}
