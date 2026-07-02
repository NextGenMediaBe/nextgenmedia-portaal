export const dynamic = 'force-dynamic'

import { formatEuro } from '@/lib/utils'
import { TrendingDown, Repeat2, ArrowDownRight } from 'lucide-react'
import { loadCore, readPeriodParams, MONTHS } from '@/lib/finance-data'
import { costActive, toMonthly, type CostEntry } from '@/lib/finance'
import { Kpi } from '../kpi'
import { KostenCharts } from '../kosten-charts'
import { CostForm } from '../cost-form'
import { CostTable } from '../cost-table'

function costYearValue(c: CostEntry, year: number): number {
  if (c.type === 'recurring') {
    let t = 0
    for (let mi = 0; mi < 12; mi++) if (costActive(c, year, mi)) t += toMonthly(Number(c.amount_excl), c.billing_frequency)
    return t
  }
  if (c.cost_date && new Date(c.cost_date).getFullYear() === year) return Number(c.amount_excl)
  return 0
}

export default async function KostenPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { year } = readPeriodParams(await searchParams)
  const c = await loadCore(year)

  const recurringCostFY = c.costs.filter(x => x.type === 'recurring').reduce((s, x) => s + costYearValue(x, year), 0)
  const oneTimeCostFY = c.costs.filter(x => x.type === 'one_time').reduce((s, x) => s + costYearValue(x, year), 0)
  const totaalFY = c.kostenManualFY + c.socialAsCostFY

  const monthlyChart = c.monthly.map(m => ({ label: MONTHS[m.mi], kosten: Math.round(m.kostenManual + c.socialPerMonth) }))

  const perCat: Record<string, number> = {}
  for (const x of c.costs) { const v = costYearValue(x, year); if (v > 0) { const cat = x.category || 'Overig'; perCat[cat] = (perCat[cat] ?? 0) + v } }
  if (c.socialAsCostFY > 0) perCat['Sociale bijdragen'] = (perCat['Sociale bijdragen'] ?? 0) + c.socialAsCostFY
  const categories = Object.entries(perCat).sort(([, a], [, b]) => b - a).map(([name, value]) => ({ name, value: Math.round(value) }))
  const catTotal = categories.reduce((s, x) => s + x.value, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end"><CostForm /></div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <Kpi label={`Totale kosten ${year}`} value={formatEuro(totaalFY)} sub="excl. btw" color="text-red-600" Icon={TrendingDown} />
        <Kpi label="Recurring kosten" value={formatEuro(recurringCostFY)} sub={`per maand nu: ${formatEuro(c.recurringCostNow)}`} color="text-red-600" Icon={Repeat2} />
        <Kpi label="Eenmalige kosten" value={formatEuro(oneTimeCostFY)} color="text-orange-600" Icon={ArrowDownRight} />
      </div>

      <KostenCharts monthly={monthlyChart} categories={categories} year={year} />

      <div className="card-base">
        <h2 className="font-semibold mb-1">Kosten per categorie</h2>
        <div className="text-xs text-gray-400 mb-4">Boekjaar {year}</div>
        {categories.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Geen kosten in dit boekjaar</p>
        ) : (
          <div className="space-y-3">
            {categories.map(({ name, value }) => {
              const pct = catTotal > 0 ? (value / catTotal) * 100 : 0
              return (
                <div key={name}>
                  <div className="flex justify-between text-sm mb-1"><span className="font-medium">{name}</span><span>{formatEuro(value)} <span className="text-gray-400">({pct.toFixed(0)}%)</span></span></div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <CostTable costs={c.costs} />
    </div>
  )
}
