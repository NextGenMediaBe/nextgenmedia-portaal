'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard, Users, FileText, UserSquare2, ArrowLeftRight, TrendingUp,
  LogOut, ChevronDown, Globe, Calendar, Briefcase, RefreshCcw, Menu, X,
  Info, ClipboardList, CalendarDays, ShoppingCart, Mail, Receipt, Newspaper, Rocket, UserCog,
} from 'lucide-react'
import { canSeeModule } from '@/lib/staff'
import { useState } from 'react'
import { useRefresh } from '@/lib/use-refresh'
import { Logo } from '@/components/logo'

const NAV = [
  { label: 'Command Center', href: '/admin', icon: LayoutDashboard, exact: true },
  { label: 'Klanten',        href: '/admin/clients',              icon: Users, module: 'clients' },
  { label: 'Contracten',     href: '/admin/contracts',            icon: FileText, module: 'contracts' },
  {
    label: 'Diensten', href: '/admin/services', icon: Briefcase, module: 'content',
    children: [
      { label: 'Social Media', href: '/admin/services/social-media', icon: Calendar },
      { label: 'Website',      href: '/admin/services/website',      icon: Globe },
    ],
  },
  {
    label: 'Blogs', href: '/admin/blog-calendar', icon: Newspaper, module: 'blogs',
    children: [
      { label: 'Projecten', href: '/admin/blogaccounts',  icon: Newspaper },
      { label: 'Kalender',  href: '/admin/blog-calendar', icon: CalendarDays },
    ],
  },
  { label: 'Partners',    href: '/admin/partners',     icon: UserSquare2, module: 'partners' },
  { label: 'Opdrachten',  href: '/admin/assignments',  icon: Briefcase, module: 'assignments' },
  { label: 'Settlements', href: '/admin/settlements',  icon: ArrowLeftRight, module: 'settlements' },
  { label: 'Prognose',    href: '/admin/revenue/omzet', icon: TrendingUp, module: 'finance' },
  { label: 'Facturen',    href: '/admin/invoices',     icon: Receipt, module: 'invoices' },
  { label: 'Vesting',     href: '/admin/vesting',      icon: Rocket, module: 'vesting' },
  { label: 'Aankopen',    href: '/admin/purchases',    icon: ShoppingCart, module: 'purchases' },
  { label: 'E-mailcenter', href: '/admin/email', icon: Mail, module: 'email' },
  {
    label: 'Informatief', href: '/admin/informatief', icon: Info, module: 'info',
    children: [
      { label: 'Onboarding Info', href: '/admin/onboarding',   icon: ClipboardList },
      { label: 'Maandplanning',   href: '/admin/maandplanning', icon: CalendarDays },
      { label: 'Voorwaarden',     href: '/admin/voorwaarden',   icon: FileText },
    ],
  },
  { label: 'Werknemers',  href: '/admin/werknemers',   icon: UserCog, adminOnly: true },
]

function NavItem({
  item,
  depth = 0,
  onNavigate,
}: {
  item: typeof NAV[number]
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

export function AdminSidebar({ allowedModules, isEmployee = false }: { allowedModules?: string[]; isEmployee?: boolean } = {}) {
  const router = useRouter()
  const { refresh, spinning } = useRefresh()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Werknemer ziet enkel toegestane modules; admin (allowedModules undefined) ziet alles.
  const visibleNav = NAV.filter((item) => {
    if ('adminOnly' in item && item.adminOnly && isEmployee) return false
    const moduleKey = 'module' in item ? (item.module as string | undefined) : undefined
    if (!moduleKey || !allowedModules) return true
    return canSeeModule(allowedModules, moduleKey)
  })

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
          {visibleNav.map((item) => (
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
