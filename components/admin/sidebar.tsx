'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, FileText, UserSquare2, ArrowLeftRight, TrendingUp,
  LogOut, ChevronDown, Globe, Calendar, Briefcase, RefreshCcw, Menu, X,
  Info, ClipboardList, CalendarDays, PieChart,
} from 'lucide-react'
import { useState } from 'react'
import { useRefresh } from '@/lib/use-refresh'
import { Logo } from '@/components/logo'

const NAV = [
  { label: 'Command Center', href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Klanten',        href: '/admin/clients',              icon: Users },
  { label: 'Contracten',     href: '/admin/contracts',            icon: FileText },
  {
    label: 'Diensten', href: '/admin/services', icon: Briefcase,
    children: [
      { label: 'Social Media', href: '/admin/services/social-media', icon: Calendar },
      { label: 'Website',      href: '/admin/services/website',      icon: Globe },
    ],
  },
  { label: 'Partners',    href: '/admin/partners',     icon: UserSquare2 },
  { label: 'Opdrachten',  href: '/admin/assignments',  icon: Briefcase },
  { label: 'Settlements', href: '/admin/settlements',  icon: ArrowLeftRight },
  { label: 'Financiën',   href: '/admin/revenue',      icon: TrendingUp },
  { label: 'Vestiging',   href: '/admin/vesting',      icon: PieChart },
  {
    label: 'Informatief', href: '/admin/informatief', icon: Info,
    children: [
      { label: 'Onboarding Info', href: '/admin/onboarding',   icon: ClipboardList },
      { label: 'Maandplanning',   href: '/admin/maandplanning', icon: CalendarDays },
    ],
  },
]

function NavItem({
  item,
  depth = 0,
  onNavigate,
}: {
  item: typeof NAV[0]
  depth?: number
  onNavigate: () => void
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(() =>
    item.children?.some((c) => pathname.startsWith(c.href)) || pathname.startsWith(item.href)
  )
  const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
  const Icon = item.icon

  if (item.children) {
    return (
      <div>
        <button
          onClick={() => setOpen(!open)}
          className={cn('sidebar-item w-full justify-between', isActive && 'active')}
        >
          <span className="flex items-center gap-3">
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </span>
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {open && (
          <div className="ml-4 mt-1 space-y-0.5 border-l border-gray-100 pl-3">
            {item.children.map((child) => (
              <Link
                key={child.href}
                href={child.href}
                onClick={onNavigate}
                className={cn('sidebar-item text-xs', pathname.startsWith(child.href) && 'active')}
              >
                <child.icon className="h-3.5 w-3.5 shrink-0" />
                {child.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn('sidebar-item', isActive && 'active')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  )
}

export function AdminSidebar() {
  const router = useRouter()
  const { refresh, spinning } = useRefresh()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const closeMobile = () => setMobileOpen(false)

  return (
    <>
      {/* ── Mobile hamburger button ── */}
      <button
        className="md:hidden fixed top-3 left-3 z-50 h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-gray-200 shadow-sm"
        onClick={() => setMobileOpen(true)}
        aria-label="Menu openen"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* ── Backdrop ── */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          onClick={closeMobile}
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={cn(
          'fixed left-0 top-0 h-screen w-[var(--sidebar-width)] bg-white border-r border-gray-200 flex flex-col z-40',
          'transition-transform duration-300 ease-in-out',
          'md:translate-x-0',
          mobileOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full',
        )}
      >
        {/* Logo + close */}
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-black leading-tight">NextGenMedia</div>
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Admin</div>
            </div>
            {/* Refresh */}
            <button
              onClick={refresh}
              disabled={spinning}
              title="Pagina vernieuwen"
              className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <RefreshCcw className={cn('h-3.5 w-3.5', spinning && 'animate-spin')} />
            </button>
            {/* Close (mobile) */}
            <button
              onClick={closeMobile}
              className="md:hidden h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100"
              aria-label="Menu sluiten"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <NavItem key={item.href} item={item} onNavigate={closeMobile} />
          ))}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Uitloggen
          </button>
        </div>
      </aside>
    </>
  )
}
