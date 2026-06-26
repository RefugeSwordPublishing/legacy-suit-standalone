'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useCurrentUser, isHighRole } from '@/lib/hooks/useCurrentUser'
import { LayoutDashboard, Users, LogOut, Menu, X, Building2, Tag, FolderKanban, Clock, Receipt, CalendarOff } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/dashboard',            label: 'Dashboard',  icon: LayoutDashboard, roles: 'all' },
  { href: '/dashboard/projects',   label: 'Projects',   icon: FolderKanban,    roles: 'all' },
  { href: '/dashboard/clients',    label: 'Clients',    icon: Building2,       roles: 'all' },
  { href: '/dashboard/timecards',  label: 'Timecards',  icon: Clock,           roles: 'all' },
  { href: '/dashboard/expenses',   label: 'Expenses',   icon: Receipt,         roles: 'all' },
  { href: '/dashboard/time-off',   label: 'Time Off',   icon: CalendarOff,     roles: 'all' },
  { href: '/dashboard/cost-codes', label: 'Cost Codes', icon: Tag,             roles: 'high' },
  { href: '/dashboard/users',      label: 'Users',      icon: Users,           roles: 'high' },
]

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: user } = useCurrentUser()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const visibleNav = NAV.filter(item => {
    if (item.roles === 'all') return true
    if (item.roles === 'high') return isHighRole(user?.role)
    return true
  })

  const Sidebar = () => (
    <nav className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-[#D4CFBA]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-[#3d3d1e] flex items-center justify-center shrink-0">
            <span className="text-[#EAE8E1] font-bold text-sm">L</span>
          </div>
          <span className="font-serif font-bold text-[#3d3d1e]">Legacy Suite</span>
        </div>
      </div>

      {/* Nav links */}
      <div className="flex-1 px-3 py-4 space-y-1">
        {visibleNav.map(item => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                active
                  ? 'bg-[#3d3d1e] text-[#EAE8E1]'
                  : 'text-[#7A7560] hover:bg-[#D4CFBA]/40 hover:text-[#3d3d1e]'
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </div>

      {/* User + sign out */}
      <div className="px-3 py-4 border-t border-[#D4CFBA] space-y-1">
        {user && (
          <div className="px-3 py-2 text-xs text-[#7A7560]">
            <p className="font-medium text-[#3d3d1e]">{user.first_name} {user.last_name}</p>
            <p className="capitalize">{user.role}</p>
          </div>
        )}
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[#7A7560] hover:bg-[#D4CFBA]/40 hover:text-[#3d3d1e] transition-colors w-full"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Sign Out
        </button>
      </div>
    </nav>
  )

  return (
    <div className="flex h-screen bg-[#EAE8E1]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col bg-[#F7F4EE] border-r border-[#D4CFBA]">
        <Sidebar />
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-56 h-full bg-[#F7F4EE] border-r border-[#D4CFBA]">
            <Sidebar />
          </aside>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#F7F4EE] border-b border-[#D4CFBA]">
          <button onClick={() => setMobileOpen(v => !v)}>
            {mobileOpen ? <X className="w-5 h-5 text-[#3d3d1e]" /> : <Menu className="w-5 h-5 text-[#3d3d1e]" />}
          </button>
          <span className="font-serif font-bold text-[#3d3d1e]">Legacy Suite</span>
        </div>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
