export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatEuro, SERVICE_LABELS } from '@/lib/utils'
import { TrendingUp, Repeat2, ArrowUpRight, Calendar } from 'lucide-react'
import { RevenueForm } from './revenue-form'
import { RevenueTable } from './revenue-table'
import { RevenueChart } from './revenue-chart'

// ─── Types ────────────────────────────────────────────────────────────────────

interface RevenueEntry {
  id: string
  client_id: string
  title: string | null
  service_slug: string | null
  type: 'recurring' | 'one_time'
  billing_frequency: string | null   // monthly | quarterly | semi-annual | annual
  amount_per_month: number | null    // per-period amount (despite the name)
  start_month: string | null
  end_month: string | null
  amount: number | null
  transaction_month: string | null
  notes: string | null
  created_at: string
}

// ─── Calculation helpers ───────────────────────────────────────────────────────

const FREQ_MONTHS: Record<string, number> = {
  monthly: 1, quarterly: 3, 'semi-annual': 6, annual: 12,
}

/** Convert per-period amount to monthly equivalent */
function toMonthly(amount: number, freq: string | null): number {
  return amount / (FREQ_MONTHS[freq ?? 'monthly'] ?? 1)
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function recurringMonths(entry: RevenueEntry): number {
  if (!entry.start_month) return 0
  const start = new Date(entry.start_month)
  if (!entry.end_month) return 12
  const end = new Date(entry.end_month)
  return Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1)
}

function isRecurringActive(entry: RevenueEntry, year: number, month: number): boolean {
  if (!entry.start_month) return false
  const start = new Date(entry.start_month)
  const current = `${year}-${String(month + 1).padStart(2, '0')}`
  if (current < monthKey(start)) return false
  if (!entry.end_month) return true
  const end = new Date(entry.end_month)
  return current <= monthKey(end)
}

function revenueForMonth(entries: RevenueEntry[], year: number, month: number): { recurring: number; one_time: number } {
  let recurring = 0
  let one_time = 0
  for (const e of entries) {
    if (e.type === 'recurring' && e.amount_per_month && isRecurringActive(e, year, month)) {
      recurring += toMonthly(e.amount_per_month, e.billing_frequency)
    }
    if (e.type === 'one_time' && e.amount && e.transaction_month) {
      const tm = new Date(e.transaction_month)
      if (tm.getFullYear() === year && tm.getMonth() === month) {
        one_time += e.amount
      }
    }
  }
  return { recurring, one_time }
}

// ─── Data fetcher ─────────────────────────────────────────────────────────────

async function getData() {
  const admin = createAdminSupabaseClient()
  const [{ data: entries }, { data: clients }] = await Promise.all([
    admin.from('revenue_entries').select('*').order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').is('archived_at', null),
  ])
  return {
    entries: (entries ?? []) as RevenueEntry[],
    clientMap: new Map((clients ?? []).map(c => [c.id, c.company_name])),
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function RevenuePage() {
  const { entries, clientMap } = await getData()

  const now = new Date()

  // ── KPIs ──
  const currentMRR = entries
    .filter(e => e.type === 'recurring' && isRecurringActive(e, now.getFullYear(), now.getMonth()))
    .reduce((s, e) => s + toMonthly(e.amount_per_month ?? 0, e.billing_frequency), 0)

  const totalRecurringValue = entries
    .filter(e => e.type === 'recurring')
    .reduce((s, e) => s + toMonthly(e.amount_per_month ?? 0, e.billing_frequency) * recurringMonths(e), 0)

  const remainingRecurringValue = entries
    .filter(e => e.type === 'recurring' && e.start_month)
    .reduce((s, e) => {
      if (!e.amount_per_month) return s
      const monthly = toMonthly(e.amount_per_month, e.billing_frequency)
      const thisKey = monthKey(now)
      const start = new Date(e.start_month!)
      const end = e.end_month ? new Date(e.end_month) : null
      let remaining = 0
      let cursor = new Date(now.getFullYear(), now.getMonth(), 1)
      if (cursor < start) cursor = new Date(start)
      let safety = 0
      while (safety++ < 300) {
        const k = monthKey(cursor)
        if (k < thisKey) { cursor.setMonth(cursor.getMonth() + 1); continue }
        if (end && k > monthKey(end)) break
        if (!end && remaining >= 24) break
        remaining++
        cursor.setMonth(cursor.getMonth() + 1)
      }
      return s + monthly * remaining
    }, 0)

  const totalOneTimeRevenue = entries
    .filter(e => e.type === 'one_time')
    .reduce((s, e) => s + (e.amount ?? 0), 0)

  // ── Monthly chart data — last 6 months + next 6 months ──
  const chartMonths = []
  for (let i = -5; i <= 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const { recurring, one_time } = revenueForMonth(entries, d.getFullYear(), d.getMonth())
    chartMonths.push({
      label: d.toLocaleDateString('nl-BE', { month: 'short', year: '2-digit' }),
      recurring,
      one_time,
      total: recurring + one_time,
    })
  }

  // ── Per client ──
  const perClient: Record<string, { name: string; mrr: number; one_time: number }> = {}
  for (const e of entries) {
    const name = clientMap.get(e.client_id) ?? '—'
    if (!perClient[e.client_id]) perClient[e.client_id] = { name, mrr: 0, one_time: 0 }
    if (e.type === 'recurring') perClient[e.client_id].mrr += toMonthly(e.amount_per_month ?? 0, e.billing_frequency)
    if (e.type === 'one_time') perClient[e.client_id].one_time += (e.amount ?? 0)
  }
  const clientRows = Object.values(perClient).sort((a, b) => (b.mrr + b.one_time) - (a.mrr + a.one_time))

  // ── Per service ──
  const perService: Record<string, number> = {}
  for (const e of entries) {
    const slug = e.service_slug ?? 'overig'
    const val = e.type === 'recurring'
      ? toMonthly(e.amount_per_month ?? 0, e.billing_frequency) * recurringMonths(e)
      : (e.amount ?? 0)
    perService[slug] = (perService[slug] ?? 0) + val
  }
  const totalValue = Object.values(perService).reduce((s, v) => s + v, 0)

  // ── Enrich entries ──
  const enrichedEntries = entries.map(e => ({
    ...e,
    company_name: clientMap.get(e.client_id) ?? '—',
  }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Omzet</h1>
          <p className="text-sm text-gray-500 mt-0.5">Overzicht van recurring en eenmalige omzet</p>
        </div>
        <RevenueForm />
      </div>

      {/* KPI's */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Huidige MRR</span>
            <Repeat2 className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">{formatEuro(currentMRR)}</div>
          <div className="text-xs text-gray-400 mt-1">per maand</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Totale recurring</span>
            <TrendingUp className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold">{formatEuro(totalRecurringValue)}</div>
          <div className="text-xs text-gray-400 mt-1">contractwaarde</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Resterend recurring</span>
            <Calendar className="h-4 w-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-blue-600">{formatEuro(remainingRecurringValue)}</div>
          <div className="text-xs text-gray-400 mt-1">toekomstige omzet</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Eenmalig totaal</span>
            <ArrowUpRight className="h-4 w-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600">{formatEuro(totalOneTimeRevenue)}</div>
          <div className="text-xs text-gray-400 mt-1">{entries.filter(e => e.type === 'one_time').length} transacties</div>
        </div>
      </div>

      {/* Chart */}
      <RevenueChart data={chartMonths} currentMonth={5} />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Per klant */}
        <div className="lg:col-span-2 card-base">
          <h2 className="font-semibold mb-4">Omzet per klant</h2>
          {clientRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nog geen omzet-entries</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Klant</th>
                  <th className="text-right py-2 text-xs text-gray-500 font-medium">MRR</th>
                  <th className="text-right py-2 text-xs text-gray-500 font-medium">Eenmalig</th>
                </tr>
              </thead>
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

        {/* Per dienst */}
        <div className="card-base">
          <h2 className="font-semibold mb-4">Omzet per dienst</h2>
          {Object.keys(perService).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">—</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(perService)
                .sort(([, a], [, b]) => b - a)
                .map(([slug, amount]) => {
                  const pct = totalValue > 0 ? (amount / totalValue) * 100 : 0
                  return (
                    <div key={slug}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{SERVICE_LABELS[slug] ?? slug}</span>
                        <span>{formatEuro(amount)}</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#fff848] rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      </div>

      {/* All entries */}
      <RevenueTable entries={enrichedEntries} />
    </div>
  )
}
