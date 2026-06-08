export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatEuro, SERVICE_LABELS } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet, Percent, Calendar, FileText, Landmark } from 'lucide-react'
import { RevenueForm } from './revenue-form'
import { RevenueTable } from './revenue-table'
import { CostForm } from './cost-form'
import { CostTable, type Cost } from './cost-table'
import { FinanceChart } from './finance-chart'
import { PeriodFilter } from './period-filter'

// ─── Types ──────────────────────────────────────────────────────────────────
interface RevenueEntry {
  id: string; client_id: string; title: string | null; service_slug: string | null
  type: 'recurring' | 'one_time'; billing_frequency: string | null
  amount_per_month: number | null; start_month: string | null; end_month: string | null
  amount: number | null; transaction_month: string | null; notes: string | null; created_at: string
}

// ─── Helpers ────────────────────────────────────────────────────────────────
const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12 }
const toMonthly = (amount: number, freq: string | null) => amount / (FREQ_MONTHS[freq ?? 'monthly'] ?? 1)
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function revActive(e: RevenueEntry, year: number, month: number): boolean {
  if (!e.start_month) return false
  const cur = `${year}-${String(month + 1).padStart(2, '0')}`
  if (cur < monthKey(new Date(e.start_month))) return false
  if (!e.end_month) return true
  return cur <= monthKey(new Date(e.end_month))
}
function revenueForMonth(entries: RevenueEntry[], year: number, month: number): number {
  let total = 0
  for (const e of entries) {
    if (e.type === 'recurring' && e.amount_per_month && revActive(e, year, month)) total += toMonthly(e.amount_per_month, e.billing_frequency)
    if (e.type === 'one_time' && e.amount && e.transaction_month) {
      const tm = new Date(e.transaction_month)
      if (tm.getFullYear() === year && tm.getMonth() === month) total += e.amount
    }
  }
  return total
}
function costActive(c: Cost, year: number, month: number): boolean {
  if (!c.start_date) return false
  const cur = `${year}-${String(month + 1).padStart(2, '0')}`
  if (cur < monthKey(new Date(c.start_date))) return false
  if (!c.end_date) return true
  return cur <= monthKey(new Date(c.end_date))
}
function costForMonth(costs: Cost[], year: number, month: number): number {
  let total = 0
  for (const c of costs) {
    if (c.type === 'recurring' && costActive(c, year, month)) total += toMonthly(Number(c.amount_excl), c.billing_frequency)
    if (c.type === 'one_time' && c.cost_date) {
      const d = new Date(c.cost_date)
      if (d.getFullYear() === year && d.getMonth() === month) total += Number(c.amount_excl)
    }
  }
  return total
}

async function getData() {
  const admin = createAdminSupabaseClient()
  const [{ data: entries }, { data: clients }, { data: costs }] = await Promise.all([
    admin.from('revenue_entries').select('*').order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').is('archived_at', null),
    admin.from('cost_entries').select('*').order('created_at', { ascending: false }),
  ])
  return {
    entries: (entries ?? []) as RevenueEntry[],
    costs: (costs ?? []) as Cost[],
    clientMap: new Map((clients ?? []).map(c => [c.id, c.company_name])),
  }
}

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
const PERIOD_LABEL: Record<string, string> = { month: 'Maand', quarter: 'Kwartaal', year: 'Jaar (YTD)', fy: 'Boekjaar' }

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const { entries, costs, clientMap } = await getData()
  const now = new Date()
  const nowY = now.getFullYear(); const nowM = now.getMonth()

  // Filter
  const year = Number(sp.fy) || nowY
  const period = (['month', 'quarter', 'year', 'fy'].includes(sp.period) ? sp.period : 'year') as 'month' | 'quarter' | 'year' | 'fy'
  const quarter = Math.min(4, Math.max(1, Number(sp.q) || (Math.floor(nowM / 3) + 1)))
  const month = Math.min(12, Math.max(1, Number(sp.mo) || (nowM + 1)))

  // Maandelijkse cijfers voor het geselecteerde jaar
  const monthly = Array.from({ length: 12 }, (_, mi) => {
    const omzet = revenueForMonth(entries, year, mi)
    const kosten = costForMonth(costs, year, mi)
    return { mi, omzet, kosten, winst: omzet - kosten }
  })
  const chartData = monthly.map(m => ({ label: MONTHS[m.mi], omzet: Math.round(m.omzet), kosten: Math.round(m.kosten), winst: Math.round(m.winst) }))

  // Periode-range (0-based maandindexen, inclusief)
  let from = 0, to = 11
  if (period === 'month') { from = month - 1; to = month - 1 }
  else if (period === 'quarter') { from = (quarter - 1) * 3; to = from + 2 }
  else if (period === 'year') { from = 0; to = (year === nowY ? nowM : 11) }
  const sum = (key: 'omzet' | 'kosten' | 'winst', a = from, b = to) => monthly.slice(a, b + 1).reduce((s, m) => s + m[key], 0)
  const pOmzet = sum('omzet'), pKosten = sum('kosten'), pWinst = pOmzet - pKosten
  const pMarge = pOmzet > 0 ? (pWinst / pOmzet) * 100 : 0

  // KPI's "deze maand" / "dit jaar" (vast op nu)
  const omzetMonthNow = revenueForMonth(entries, nowY, nowM)
  const kostenMonthNow = costForMonth(costs, nowY, nowM)
  let omzetYearNow = 0, kostenYearNow = 0
  for (let mi = 0; mi <= nowM; mi++) { omzetYearNow += revenueForMonth(entries, nowY, mi); kostenYearNow += costForMonth(costs, nowY, mi) }
  const winstYearNow = omzetYearNow - kostenYearNow
  const margeYearNow = omzetYearNow > 0 ? (winstYearNow / omzetYearNow) * 100 : 0

  // Open contractwaarde
  const remainingRecurring = entries.filter(e => e.type === 'recurring' && e.start_month).reduce((s, e) => {
    if (!e.amount_per_month) return s
    const monthlyAmt = toMonthly(e.amount_per_month, e.billing_frequency)
    const start = new Date(e.start_month!); const end = e.end_month ? new Date(e.end_month) : null
    let cursor = new Date(nowY, nowM, 1); if (cursor < start) cursor = new Date(start)
    let count = 0, safety = 0
    while (safety++ < 360) {
      const k = monthKey(cursor)
      if (k < monthKey(now)) { cursor.setMonth(cursor.getMonth() + 1); continue }
      if (end && k > monthKey(end)) break
      if (!end && count >= 24) break
      count++; cursor.setMonth(cursor.getMonth() + 1)
    }
    return s + monthlyAmt * count
  }, 0)
  // Nog te factureren resterend dit kalenderjaar (huidige maand t/m december)
  let nogTeFactureren = 0
  for (let mi = nowM; mi <= 11; mi++) nogTeFactureren += revenueForMonth(entries, nowY, mi)

  // Belastingindicatie — op basis van het volledige geselecteerde boekjaar
  const fyOmzet = sum('omzet', 0, 11), fyKosten = sum('kosten', 0, 11)
  const fyProfit = fyOmzet - fyKosten
  const estTax = fyProfit <= 0 ? 0 : (fyProfit <= 100000 ? fyProfit * 0.20 : 100000 * 0.20 + (fyProfit - 100000) * 0.25)
  const netAfterTax = fyProfit - estTax

  // Omzet per klant (all-time)
  const perClient: Record<string, { name: string; mrr: number; one_time: number }> = {}
  for (const e of entries) {
    const name = clientMap.get(e.client_id) ?? '—'
    if (!perClient[e.client_id]) perClient[e.client_id] = { name, mrr: 0, one_time: 0 }
    if (e.type === 'recurring') perClient[e.client_id].mrr += toMonthly(e.amount_per_month ?? 0, e.billing_frequency)
    if (e.type === 'one_time') perClient[e.client_id].one_time += (e.amount ?? 0)
  }
  const clientRows = Object.values(perClient).sort((a, b) => (b.mrr + b.one_time) - (a.mrr + a.one_time))

  // Kosten per categorie (geselecteerde periode)
  const perCategory: Record<string, number> = {}
  for (let mi = from; mi <= to; mi++) {
    for (const c of costs) {
      let v = 0
      if (c.type === 'recurring' && costActive(c, year, mi)) v = toMonthly(Number(c.amount_excl), c.billing_frequency)
      if (c.type === 'one_time' && c.cost_date) { const d = new Date(c.cost_date); if (d.getFullYear() === year && d.getMonth() === mi) v = Number(c.amount_excl) }
      if (v > 0) { const cat = c.category || 'Overig'; perCategory[cat] = (perCategory[cat] ?? 0) + v }
    }
  }
  const catTotal = Object.values(perCategory).reduce((s, v) => s + v, 0)

  const enrichedEntries = entries.map(e => ({ ...e, company_name: clientMap.get(e.client_id) ?? '—' }))

  const Stat = ({ label, value, sub, color, Icon }: { label: string; value: string; sub?: string; color?: string; Icon: React.ElementType }) => (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-gray-500 uppercase tracking-wide">{label}</span>
        <Icon className={`h-4 w-4 ${color ?? 'text-gray-400'}`} />
      </div>
      <div className={`text-2xl font-bold ${color ?? ''}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Financiën</h1>
          <p className="text-sm text-gray-500 mt-0.5">Omzet, kosten, winst en marge in één overzicht</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CostForm />
          <RevenueForm />
        </div>
      </div>

      {/* Deze maand */}
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Deze maand</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Stat label="Omzet" value={formatEuro(omzetMonthNow)} color="text-green-600" Icon={TrendingUp} />
          <Stat label="Kosten" value={formatEuro(kostenMonthNow)} color="text-red-600" Icon={TrendingDown} />
          <Stat label="Winst" value={formatEuro(omzetMonthNow - kostenMonthNow)} color={omzetMonthNow - kostenMonthNow >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
        </div>
      </div>

      {/* Dit jaar */}
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Dit jaar ({nowY})</div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Omzet" value={formatEuro(omzetYearNow)} color="text-green-600" Icon={TrendingUp} />
          <Stat label="Kosten" value={formatEuro(kostenYearNow)} color="text-red-600" Icon={TrendingDown} />
          <Stat label="Winst" value={formatEuro(winstYearNow)} color={winstYearNow >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
          <Stat label="Winstmarge" value={`${margeYearNow.toFixed(1)}%`} color={margeYearNow >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Percent} />
        </div>
      </div>

      {/* Open contractwaarde + belastingindicatie */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" />Open contractwaarde</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Toekomstige contractwaarde</div>
              <div className="text-xl font-bold text-blue-600">{formatEuro(remainingRecurring)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">resterende recurring omzet</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Nog te factureren ({nowY})</div>
              <div className="text-xl font-bold">{formatEuro(nogTeFactureren)}</div>
              <div className="text-[11px] text-gray-400 mt-0.5">resterend dit kalenderjaar</div>
            </div>
          </div>
        </div>

        <div className="card-base">
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-gray-400" />Belastingindicatie · boekjaar {year}</h2>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Winst voor belasting</div>
              <div className={`text-lg font-bold ${fyProfit >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatEuro(fyProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Gesch. venn.belasting</div>
              <div className="text-lg font-bold text-red-600">{formatEuro(estTax)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Netto na belasting</div>
              <div className="text-lg font-bold text-green-600">{formatEuro(netAfterTax)}</div>
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-3 italic">
            Indicatieve berekening (20% tot €100.000, daarboven 25%). Raadpleeg steeds de boekhouder voor definitieve cijfers. Niet te gebruiken als officiële fiscale berekening.
          </p>
        </div>
      </div>

      {/* Periodefilter + periode-totaal */}
      <PeriodFilter year={year} period={period} quarter={quarter} month={month} />
      <div>
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
          Geselecteerde periode · {PERIOD_LABEL[period]}{period === 'quarter' ? ` Q${quarter}` : period === 'month' ? ` ${MONTHS[month - 1]}` : ''} {year}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Omzet" value={formatEuro(pOmzet)} color="text-green-600" Icon={TrendingUp} />
          <Stat label="Kosten" value={formatEuro(pKosten)} color="text-red-600" Icon={TrendingDown} />
          <Stat label="Winst" value={formatEuro(pWinst)} color={pWinst >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
          <Stat label="Marge" value={`${pMarge.toFixed(1)}%`} color={pMarge >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Percent} />
        </div>
      </div>

      {/* Grafiek */}
      <FinanceChart data={chartData} year={year} />

      {/* Detail: omzet per klant + kosten per categorie */}
      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card-base">
          <h2 className="font-semibold mb-4">Omzet per klant</h2>
          {clientRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nog geen omzet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Klant</th>
                  <th className="text-right py-2 text-xs text-gray-500 font-medium">MRR</th>
                  <th className="text-right py-2 text-xs text-gray-500 font-medium">Eenmalig</th>
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {clientRows.map(row => (
                    <tr key={row.name}>
                      <td className="py-2.5 font-medium">{row.name}</td>
                      <td className="py-2.5 text-right text-green-600">{row.mrr > 0 ? formatEuro(row.mrr) + '/m' : '—'}</td>
                      <td className="py-2.5 text-right text-blue-600">{row.one_time > 0 ? formatEuro(row.one_time) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card-base">
          <h2 className="font-semibold mb-1">Kosten per categorie</h2>
          <div className="text-xs text-gray-400 mb-4">{PERIOD_LABEL[period]} {year}</div>
          {Object.keys(perCategory).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Geen kosten in deze periode</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(perCategory).sort(([, a], [, b]) => b - a).map(([cat, amount]) => {
                const pct = catTotal > 0 ? (amount / catTotal) * 100 : 0
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-sm mb-1"><span className="font-medium">{SERVICE_LABELS[cat] ?? cat}</span><span>{formatEuro(amount)}</span></div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-red-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Tabellen */}
      <RevenueTable entries={enrichedEntries} />
      <CostTable costs={costs} />
    </div>
  )
}
