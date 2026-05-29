'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { LayoutDashboard, Briefcase, ArrowLeftRight, LogOut } from 'lucide-react'

const NAV = [
  { label: 'Dashboard', href: '/partner', icon: LayoutDashboard, exact: true },
  { label: 'Opdrachten', href: '/partner/assignments', icon: Briefcase },
  { label: 'Settlements', href: '/partner/settlements', icon: ArrowLeftRight },
]

export function PartnerSidebar({ partnerName }: { partnerName: string }) {
  const pathname = usePathname()
  const router = useRouter()

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-[var(--sidebar-width)] bg-white border-r border-gray-200 flex flex-col z-30">
      <div className="px-4 py-5 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-900 flex items-center justify-center shrink-0">
            <span className="font-bold text-white text-xs">P</span>
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-black leading-tight truncate">{partnerName}</div>
            <div className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Partnerportaal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map((item) => {
          const isActive = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link key={item.href} href={item.href} className={cn('sidebar-item', isActive && 'active')}>
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-gray-100">
        <button onClick={handleLogout} className="sidebar-item w-full text-red-500 hover:text-red-600 hover:bg-red-50">
          <LogOut className="h-4 w-4" />
          Uitloggen
        </button>
      </div>
    </aside>
  )
}
