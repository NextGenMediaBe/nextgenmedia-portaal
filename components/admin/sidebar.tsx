'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  FileText,
  UserSquare2,
  ArrowLeftRight,
  TrendingUp,
  LogOut,
  ChevronDown,
  Globe,
  Calendar,
  Briefcase,
  RefreshCcw,
} from 'lucide-react'
import { useState, useTransition } from 'react'

const NAV = [
  {
    label: 'Command Center',
    href: '/admin',
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: 'Klanten',
    href: '/admin/clients',
    icon: Users,
  },
  {
    label: 'Contracten',
    href: '/admin/contracts',
    icon: FileText,
  },
  {
    label: 'Diensten',
    href: '/admin/services',
    icon: Briefcase,
    children: [
      { label: 'Social Media', href: '/admin/services/social-media', icon: Calendar },
      { label: 'Website', href: '/admin/services/website', icon: Globe },
    ],
  },
  {
    label: 'Partners',
    href: '/admin/partners',
    icon: UserSquare2,
  },
  {
    label: 'Opdrachten',
    href: '/admin/assignments',
    icon: Briefcase,
  },
  {
    label: 'Settlements',
    href: '/admin/settlements',
    icon: ArrowLeftRight,
  },
  {
    label: 'Omzet',
    href: '/admin/revenue',
    icon: TrendingUp,
  },
]

function NavItem({ item, depth = 0 }: { item: typeof NAV[0]; depth?: number }) {
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
          className={cn(
            'sidebar-item w-full justify-between',
            isActive && 'active'
          )}
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
                className={cn(
                  'sidebar-item text-xs',
                  pathname.startsWith(child.href) && 'active'
                )}
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
      className={cn('sidebar-item', isActive && 'active')}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  )
}

export function AdminSidebar() {
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

  return (
    <aside className="fixed left-0 top-0 h-screen w-[var(--sidebar-width)] bg-white border-r border-gray-200 flex flex-col z-30">
      {/* Logo + refresh */}
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-[#fff848] flex items-center justify-center shrink-0">
            <span className="font-bold text-black text-xs">NG</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-black leading-tight">NextGenMedia</div>
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Admin</div>
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

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV.map((item) => (
          <NavItem key={item.href} item={item} />
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
  )
}
