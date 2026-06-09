export const dynamic = 'force-dynamic'

import { formatEuro, SERVICE_LABELS, SERVICE_SLUGS } from '@/lib/utils'
import { TrendingUp, Repeat2, ArrowUpRight, Activity } from 'lucide-react'
import { loadCore, readPeriodParams, MONTHS } from '@/lib/finance-data'
import { revActive, toMonthly, type RevenueEntry } from '@/lib/finance'
import { Kpi } from '../kpi'
import { OmzetCharts } from '../omzet-charts'
import { RevenueForm } from '../revenue-form'
import { RevenueTable } from '../revenue-table'

function entryYearValue(e: RevenueEntry, year: number): number {
  if (e.type === 'recurring') {
    let t = 0
    for (let mi = 0; mi < 12; mi++) if (e.amount_per_month && revActive(e, year, mi)) t += toMonthly(e.amount_per_month, e.billing_frequency)
    return t
  }
  if (e.amount && e.transaction_month) { const d = new Date(e.transaction_month); if (d.getFullYear() === year) return e.amount }
  return 0
}

export default async function OmzetPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { year } = readPeriodParams(await searchParams)
  const c = await loadCore(year)

  // Vorig boekjaar voor groei
  let prevOmzet = 0
  for (let mi = 0; mi < 12; mi++) { const r = c.entries.reduce((s, e) => s + (e.type === 'recurring' && e.amount_per_month && revActive(e, year - 1, mi) ? toMonthly(e.amount_per_month, e.billing_frequency) : 0), 0); prevOmzet += r }
  for (const e of c.entries) if (e.type === 'one_time' && e.amount && e.transaction_month && new Date(e.transaction_month).getFullYear() === year - 1) prevOmzet += e.amount
  const growth = prevOmzet > 0 ? ((c.omzetFY - prevOmzet) / prevOmzet) * 100 : 0

  const monthlyChart = c.monthly.map(m => ({ label: MONTHS[m.mi], recurring: Math.round(m.omzetRec), eenmalig: Math.round(m.omzetOne) }))
  const quarters = [0, 1, 2, 3].map(q => ({ label: `Q${q + 1}`, omzet: Math.round(c.monthly.slice(q * 3, q * 3 + 3).reduce((s, m) => s + m.omzet, 0)) }))

  // Per dienst (boekjaar)
  const perService: Record<string, number> = {}
  for (const e of c.entries) { const v = entryYearValue(e, year); if (v > 0) { const slug = e.service_slug || 'overig'; perService[slug] = (perService[slug] ?? 0) + v } }
  const serviceTotal = Object.values(perService).reduce((s, v) => s + v, 0)
  const orderedServices = [...SERVICE_SLUGS as readonly string[], 'overig'].filter(s => perService[s])

  const enriched = c.entries.map(e => ({ ...e, company_name: c.clientMap.get(e.client_id) ?? '—' }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end"><RevenueForm /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label={`Totale omzet ${year}`} value={formatEuro(c.omzetFY)} color="text-green-600" Icon={TrendingUp} />
        <Kpi label="Recurring omzet" value={formatEuro(c.omzetRecFY)} sub={`MRR nu: ${formatEuro(c.mrr)}`} color="text-green-600" Icon={Repeat2} />
        <Kpi label="Eenmalige omzet" value={formatEuro(c.omzetOneFY)} color="text-blue-600" Icon={ArrowUpRight} />
        <Kpi label="Omzetgroei" value={`${growth >= 0 ? '+' : ''}${growth.toFixed(1)}%`} sub={`t.o.v. ${year - 1}`} color={growth >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Activity} />
      </div>

      <OmzetCharts monthly={monthlyChart} quarters={quarters} year={year} />

      <div className="card-base">
        <h2 className="font-semibold mb-1">Omzet per dienst</h2>
        <div className="text-xs text-gray-400 mb-4">Boekjaar {year}</div>
        {orderedServices.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Geen omzet in dit boekjaar</p>
        ) : (
          <div className="space-y-3">
            {orderedServices.map(slug => {
              const amount = perService[slug]
              const pct = serviceTotal > 0 ? (amount / serviceTotal) * 100 : 0
              return (
                <div key={slug}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">{SERVICE_LABELS[slug] ?? 'Overig'}</span><span>{formatEuro(amount)} <span className="text-gray-400">({pct.toFixed(0)}%)</span></span></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-[#fff848] rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <RevenueTable entries={enriched} />
    </div>
  )
}
