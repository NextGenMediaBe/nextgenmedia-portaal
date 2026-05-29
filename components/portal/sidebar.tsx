'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LayoutDashboard, FileText, Calendar, Globe, LogOut, RefreshCcw } from 'lucide-react'

type NavItem = {
  label: string
  href: string
  icon: React.ElementType
  exact?: boolean
  requiresService?: string
}

const NAV: NavItem[] = [
  { label: 'Dashboard', href: '/portal', icon: LayoutDashboard, exact: true },
  { label: 'Contracten', href: '/portal/contracts', icon: FileText },
  { label: 'Social Media', href: '/portal/social-media', icon: Calendar, requiresService: 'social-media' },
  { label: 'Website', href: '/portal/website', icon: Globe, requiresService: 'webdesign' },
]

export function PortalSidebar({
  companyName,
  activeServices = [],
}: {
  companyName: string
  activeServices?: string[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  const handleRefresh = () => {
    startTransition(() => { router.refresh() })
  }

  const visibleNav = NAV.filter((item) =>
    !item.requiresService || activeServices.includes(item.requiresService)
  )

  return (
    <aside className="fixed left-0 top-0 h-screen w-[var(--sidebar-width)] bg-white border-r border-gray-200 flex flex-col z-30">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#fff848] flex items-center justify-center shrink-0">
            <span className="font-bold text-black text-xs">NG</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-black leading-tight truncate">{companyName}</div>
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Klantenportaal</div>
          </div>
          <button
            onClick={handleRefresh}
            title="Pagina vernieuwen"
            className="h-7 w-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <RefreshCcw className={cn('h-3.5 w-3.5', isPending && 'animate-spin')} />
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
  )
}
