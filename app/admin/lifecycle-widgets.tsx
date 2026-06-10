import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { Camera, Users, CalendarClock, FileWarning, AlertTriangle, CalendarRange } from 'lucide-react'
import { loadActiveSocialLifecycles } from '@/lib/lifecycle-data'

export async function LifecycleWidgets() {
  const now = new Date()
  const todayISO = now.toISOString().slice(0, 10)
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)

  const admin = createAdminSupabaseClient()
  const [lifecycles, shootsToday, shootsMonth] = await Promise.all([
    loadActiveSocialLifecycles(now),
    admin.from('shoot_briefings').select('id', { count: 'exact', head: true }).eq('shoot_date', todayISO),
    admin.from('shoot_briefings').select('id', { count: 'exact', head: true }).gte('shoot_date', firstOfMonth).lte('shoot_date', lastOfMonth),
  ])

  const reviews = lifecycles.filter(c => c.reviewThisMonth)
  const renewals = lifecycles.filter(c => c.daysUntilEnd != null && c.daysUntilEnd <= 60).sort((a, b) => (a.daysUntilEnd ?? 0) - (b.daysUntilEnd ?? 0))
  const noPlanning = lifecycles.filter(c => !c.hasPlanning)

  const Mini = ({ label, value, color, Icon }: { label: string; value: string | number; color?: string; Icon: React.ElementType }) => (
    <div className="rounded-xl border border-gray-100 bg-white p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mb-1"><Icon className={`h-3.5 w-3.5 ${color ?? 'text-gray-400'}`} />{label}</div>
      <div className={`text-xl font-bold ${color ?? ''}`}>{value}</div>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Vandaag */}
      <div className="card-base">
        <h3 className="font-semibold text-sm mb-3">Vandaag</h3>
        <div className="grid grid-cols-1 gap-2">
          <Mini label="Shoots vandaag" value={shootsToday.count ?? 0} color="text-purple-600" Icon={Camera} />
          <p className="text-[11px] text-gray-400">Meetings & editwerk volgen uit de maandplanning-fases (werkdag 3–5 & 11–18).</p>
        </div>
      </div>

      {/* Deze maand */}
      <div className="card-base">
        <h3 className="font-semibold text-sm mb-3">Deze maand</h3>
        <div className="grid grid-cols-2 gap-2">
          <Mini label="Contentklanten" value={lifecycles.length} Icon={Users} />
          <Mini label="Shoots" value={shootsMonth.count ?? 0} color="text-purple-600" Icon={Camera} />
          <Mini label="Strategie reviews" value={reviews.length} color="text-purple-600" Icon={CalendarClock} />
          <Mini label="Contractverlengingen" value={renewals.length} color="text-amber-600" Icon={CalendarRange} />
        </div>
      </div>

      {/* Aandacht nodig */}
      <div className="card-base">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" />Aandacht nodig</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-600"><FileWarning className="h-3.5 w-3.5 text-amber-500" />Contracten aflopend (≤60d)</span><span className="font-semibold">{renewals.length}</span></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-600"><CalendarClock className="h-3.5 w-3.5 text-purple-500" />Reviews deze maand</span><span className="font-semibold">{reviews.length}</span></div>
          <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-gray-600"><AlertTriangle className="h-3.5 w-3.5 text-red-500" />Klanten zonder contentplanning</span><span className="font-semibold">{noPlanning.length}</span></div>
        </div>
        {renewals.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1">
            {renewals.slice(0, 4).map(c => (
              <div key={c.clientId} className="flex items-center justify-between text-xs">
                <span className="truncate">{c.companyName}</span>
                <span className={`${(c.daysUntilEnd ?? 0) <= 14 ? 'text-red-600' : 'text-amber-600'}`}>{c.endDate ? formatDate(c.endDate) : '—'} ({c.daysUntilEnd}d)</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
