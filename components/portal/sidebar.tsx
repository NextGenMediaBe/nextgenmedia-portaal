'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { useRefresh } from '@/lib/use-refresh'
import { Logo } from '@/components/logo'
import { LayoutDashboard, FileText, Calendar, Globe, LogOut, RefreshCcw, Menu, X, ListChecks, Newspaper } from 'lucide-react'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
  requiresService?: string
  requiresBlogs?: boolean
  module?: string
}

const NAV: NavItem[] = [
  { label: 'Dashboard',    href: '/portal',               icon: LayoutDashboard, exact: true },
  { label: 'Contracten',   href: '/portal/contracts',     icon: FileText,  module: 'contracts' },
  { label: 'Taken',        href: '/portal/tasks',         icon: ListChecks, module: 'tasks' },
  { label: 'Social Media', href: '/portal/social-media',  icon: Calendar, requiresService: 'social-media', module: 'social_media' },
  { label: 'Website',      href: '/portal/website',       icon: Globe,    requiresService: 'webdesign', module: 'website' },
  { label: 'Blogs',        href: '/portal/blogs',         icon: Newspaper, requiresBlogs: true, module: 'blogs' },
]

export function PortalSidebar({
  companyName,
  activeServices = [],
  hasBlogs = false,
  allowedModules,
}: {
  companyName: string
  activeServices?: string[]
  hasBlogs?: boolean
  /** Modules met view-recht. Undefined = alles tonen (owner/backward compat). */
  allowedModules?: string[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const { refresh, spinning } = useRefresh()
  const [mobileOpen, setMobileOpen] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const closeMobile = () => setMobileOpen(false)

  const visibleNav = NAV.filter(
    (item) =>
      (!item.requiresService || activeServices.includes(item.requiresService)) &&
      (!item.requiresBlogs || hasBlogs) &&
      (!item.module || !allowedModules || allowedModules.includes(item.module))
  )

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
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <Logo className="h-8 w-8 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-black leading-tight truncate">{companyName}</div>
              <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Klantenportaal</div>
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

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMobile}
                className={cn('sidebar-item', isActive && 'active')}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="px-3 py-4 border-t border-gray-100">
          <button
            onClick={handleLogout}
            className="sidebar-item w-full text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4" />
            Uitloggen
          </button>
        </div>
      </aside>
    </>
  )
}
