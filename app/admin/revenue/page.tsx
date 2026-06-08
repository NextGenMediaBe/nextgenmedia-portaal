export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatEuro } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet, Percent, Landmark, FileText, Users, Activity } from 'lucide-react'
import { RevenueForm } from './revenue-form'
import { RevenueTable } from './revenue-table'
import { CostForm } from './cost-form'
import { CostTable, type Cost } from './cost-table'
import { FinanceChart } from './finance-chart'
import { PeriodFilter } from './period-filter'
import { FiscalSettingsForm } from './fiscal-settings-form'
import { mergeFiscalSettings, estimateCorporateTax, estimateSocialContribution } from '@/lib/finance'

interface RevenueEntry {
  id: string; client_id: string; title: string | null; service_slug: string | null
  type: 'recurring' | 'one_time'; billing_frequency: string | null
  amount_per_month: number | null; start_month: string | null; end_month: string | null
  amount: number | null; transaction_month: string | null; notes: string | null; created_at: string
}

const FREQ_MONTHS: Record<string, number> = { monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12 }
const toMonthly = (amount: number, freq: string | null) => amount / (FREQ_MONTHS[freq ?? 'monthly'] ?? 1)
const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

function revActive(e: RevenueEntry, y: number, m: number): boolean {
  if (!e.start_month) return false
  const cur = `${y}-${String(m + 1).padStart(2, '0')}`
  if (cur < monthKey(new Date(e.start_month))) return false
  if (!e.end_month) return true
  return cur <= monthKey(new Date(e.end_month))
}
function revenueForMonth(entries: RevenueEntry[], y: number, m: number): number {
  let t = 0
  for (const e of entries) {
    if (e.type === 'recurring' && e.amount_per_month && revActive(e, y, m)) t += toMonthly(e.amount_per_month, e.billing_frequency)
    if (e.type === 'one_time' && e.amount && e.transaction_month) { const tm = new Date(e.transaction_month); if (tm.getFullYear() === y && tm.getMonth() === m) t += e.amount }
  }
  return t
}
function costActive(c: Cost, y: number, m: number): boolean {
  if (!c.start_date) return false
  const cur = `${y}-${String(m + 1).padStart(2, '0')}`
  if (cur < monthKey(new Date(c.start_date))) return false
  if (!c.end_date) return true
  return cur <= monthKey(new Date(c.end_date))
}
function costForMonth(costs: Cost[], y: number, m: number): number {
  let t = 0
  for (const c of costs) {
    if (c.type === 'recurring' && costActive(c, y, m)) t += toMonthly(Number(c.amount_excl), c.billing_frequency)
    if (c.type === 'one_time' && c.cost_date) { const d = new Date(c.cost_date); if (d.getFullYear() === y && d.getMonth() === m) t += Number(c.amount_excl) }
  }
  return t
}

async function getData(year: number) {
  const admin = createAdminSupabaseClient()
  const [{ data: entries }, { data: clients }, { data: costs }, { data: fiscalRow }] = await Promise.all([
    admin.from('revenue_entries').select('*').order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').is('archived_at', null),
    admin.from('cost_entries').select('*').order('created_at', { ascending: false }),
    admin.from('fiscal_settings').select('*').eq('year', year).maybeSingle(),
  ])
  return {
    entries: (entries ?? []) as RevenueEntry[],
    costs: (costs ?? []) as Cost[],
    clientMap: new Map((clients ?? []).map(c => [c.id, c.company_name])),
    fiscalRow,
  }
}

const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
const PERIOD_LABEL: Record<string, string> = { month: 'Maand', quarter: 'Kwartaal', fy: 'Boekjaar' }

export default async function FinancePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const now = new Date()
  const year = Number(sp.fy) || now.getFullYear()
  const period = (['month', 'quarter', 'fy'].includes(sp.period) ? sp.period : 'fy') as 'month' | 'quarter' | 'fy'
  const quarter = Math.min(4, Math.max(1, Number(sp.q) || (Math.floor(now.getMonth() / 3) + 1)))
  const month = Math.min(12, Math.max(1, Number(sp.mo) || (now.getMonth() + 1)))

  const { entries, costs, clientMap, fiscalRow } = await getData(year)
  const settings = mergeFiscalSettings(year, fiscalRow)

  // Maandcijfers voor het boekjaar (kostenManual = enkel cost_entries, excl. btw)
  const monthly = Array.from({ length: 12 }, (_, mi) => ({
    mi, omzet: revenueForMonth(entries, year, mi), kostenManual: costForMonth(costs, year, mi),
  }))
  const omzetFY = monthly.reduce((s, m) => s + m.omzet, 0)
  const kostenManualFY = monthly.reduce((s, m) => s + m.kostenManual, 0)
  const ebitdaFY = omzetFY - kostenManualFY

  // Loon + sociale bijdragen (boekjaar)
  const jaarloon = Number(settings.salary_gross_monthly) * Number(settings.salary_months)
  const social = estimateSocialContribution(jaarloon, settings)
  const socialAsCostFY = settings.include_social_as_cost ? social.annual : 0
  const socialPerMonth = socialAsCostFY / 12

  // Boekjaar fiscaal
  const winstFY = ebitdaFY - socialAsCostFY                 // winst voor belasting (boekjaar)
  const taxFY = estimateCorporateTax(winstFY, settings)
  const netFY = winstFY - taxFY
  const totalFiscal = taxFY + social.annual
  const pressurePct = omzetFY > 0 ? (totalFiscal / omzetFY) * 100 : 0

  // Periode-range
  let from = 0, to = 11
  if (period === 'month') { from = month - 1; to = month - 1 }
  else if (period === 'quarter') { from = (quarter - 1) * 3; to = from + 2 }
  const monthsInPeriod = to - from + 1
  const omzetP = monthly.slice(from, to + 1).reduce((s, m) => s + m.omzet, 0)
  const kostenManualP = monthly.slice(from, to + 1).reduce((s, m) => s + m.kostenManual, 0)
  const socialP = socialPerMonth * monthsInPeriod
  const kostenP = kostenManualP + socialP
  const ebitdaP = omzetP - kostenManualP
  const winstP = omzetP - kostenP
  const margeP = omzetP > 0 ? (winstP / omzetP) * 100 : 0

  // Grafiek + maandtabel (kosten incl. sociale bijdragen indien gekozen)
  const chartData = monthly.map(m => {
    const k = m.kostenManual + socialPerMonth
    return { label: MONTHS[m.mi], omzet: Math.round(m.omzet), kosten: Math.round(k), winst: Math.round(m.omzet - k) }
  })

  // Omzet per klant (all-time)
  const perClient: Record<string, { name: string; mrr: number; one_time: number }> = {}
  for (const e of entries) {
    const name = clientMap.get(e.client_id) ?? '—'
    if (!perClient[e.client_id]) perClient[e.client_id] = { name, mrr: 0, one_time: 0 }
    if (e.type === 'recurring') perClient[e.client_id].mrr += toMonthly(e.amount_per_month ?? 0, e.billing_frequency)
    if (e.type === 'one_time') perClient[e.client_id].one_time += (e.amount ?? 0)
  }
  const clientRows = Object.values(perClient).sort((a, b) => (b.mrr + b.one_time) - (a.mrr + a.one_time))

  const enrichedEntries = entries.map(e => ({ ...e, company_name: clientMap.get(e.client_id) ?? '—' }))

  const periodTxt = `${PERIOD_LABEL[period]}${period === 'quarter' ? ` Q${quarter}` : period === 'month' ? ` ${MONTHS[month - 1]}` : ''} ${year}`

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
          <p className="text-sm text-gray-500 mt-0.5">Omzet, kosten, winst, marge & indicatieve fiscale druk</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CostForm />
          <RevenueForm />
        </div>
      </div>

      <PeriodFilter year={year} period={period} quarter={quarter} month={month} />

      {/* KPI's */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Omzet" value={formatEuro(omzetP)} sub={periodTxt} color="text-green-600" Icon={TrendingUp} />
        <Stat label="Kosten" value={formatEuro(kostenP)} sub={`${periodTxt} · excl. btw`} color="text-red-600" Icon={TrendingDown} />
        <Stat label="Winst voor belasting" value={formatEuro(winstP)} sub={periodTxt} color={winstP >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
        <Stat label="Marge" value={`${margeP.toFixed(1)}%`} sub={periodTxt} color={margeP >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Percent} />
        <Stat label="EBITDA (indicatief)" value={formatEuro(ebitdaP)} sub={`${periodTxt} · vóór sociale bijdr./belasting`} Icon={Activity} />
        <Stat label="Venn.belasting (indic.)" value={formatEuro(taxFY)} sub={`boekjaar ${year}`} color="text-red-600" Icon={Landmark} />
        <Stat label="Sociale bijdragen (indic.)" value={formatEuro(social.annual)} sub={`boekjaar ${year}`} color="text-red-600" Icon={Users} />
        <Stat label="Nettowinst na belasting" value={formatEuro(netFY)} sub={`boekjaar ${year}`} color={netFY >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
      </div>

      {/* Belastingindicatie */}
      <div className="card-base">
        <h2 className="font-semibold mb-3 flex items-center gap-2"><Landmark className="h-4 w-4 text-gray-400" />Belastingindicatie · boekjaar {year}</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div><div className="text-xs text-gray-500 mb-1">Winst voor belasting</div><div className={`text-lg font-bold ${winstFY >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatEuro(winstFY)}</div></div>
          <div><div className="text-xs text-gray-500 mb-1">Gesch. venn.belasting</div><div className="text-lg font-bold text-red-600">{formatEuro(taxFY)}</div></div>
          <div><div className="text-xs text-gray-500 mb-1">Nettowinst na belasting</div><div className="text-lg font-bold text-green-600">{formatEuro(netFY)}</div></div>
          <div><div className="text-xs text-gray-500 mb-1">Sociale bijdr. op loon</div><div className="text-lg font-bold text-red-600">{formatEuro(social.annual)}</div></div>
          <div><div className="text-xs text-gray-500 mb-1">Totale fiscale druk</div><div className="text-lg font-bold">{formatEuro(totalFiscal)}<span className="text-xs text-gray-400 font-normal ml-1">({pressurePct.toFixed(1)}%)</span></div></div>
        </div>
        <p className="text-[11px] text-gray-400 mt-3 italic">Indicatieve berekening op basis van de instelbare parameters hieronder. Raadpleeg steeds de boekhouder voor definitieve fiscale cijfers.</p>
      </div>

      {/* Grafiek */}
      <FinanceChart data={chartData} year={year} />

      {/* Maandtabel binnen boekjaar */}
      <div className="card-base">
        <h2 className="font-semibold mb-4">Per maand · boekjaar {year}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead><tr className="border-b border-gray-100">
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Maand</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Omzet</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Kosten</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Winst</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Marge</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {monthly.map((m) => {
                const k = m.kostenManual + socialPerMonth
                const w = m.omzet - k
                const marge = m.omzet > 0 ? (w / m.omzet) * 100 : 0
                return (
                  <tr key={m.mi} className="hover:bg-gray-50/50">
                    <td className="py-2 font-medium">{MONTHS[m.mi]}</td>
                    <td className="py-2 text-right text-green-600">{m.omzet > 0 ? formatEuro(m.omzet) : '—'}</td>
                    <td className="py-2 text-right text-red-600">{k > 0 ? formatEuro(k) : '—'}</td>
                    <td className={`py-2 text-right font-medium ${w >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{formatEuro(w)}</td>
                    <td className="py-2 text-right text-gray-500">{m.omzet > 0 ? `${marge.toFixed(0)}%` : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="py-2">Boekjaar {year}</td>
                <td className="py-2 text-right text-green-700">{formatEuro(omzetFY)}</td>
                <td className="py-2 text-right text-red-700">{formatEuro(kostenManualFY + socialAsCostFY)}</td>
                <td className="py-2 text-right">{formatEuro(winstFY)}</td>
                <td className="py-2 text-right">{omzetFY > 0 ? `${((winstFY / omzetFY) * 100).toFixed(0)}%` : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Omzet per klant */}
      <div className="card-base">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><FileText className="h-4 w-4 text-gray-400" />Omzet per klant</h2>
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

      {/* Fiscale instellingen + loonsimulatie */}
      <FiscalSettingsForm settings={settings} ebitdaFY={ebitdaFY} />

      {/* Tabellen */}
      <RevenueTable entries={enrichedEntries} />
      <CostTable costs={costs} />
    </div>
  )
}
