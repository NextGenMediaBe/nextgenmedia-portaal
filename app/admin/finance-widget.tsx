import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { loadCore } from '@/lib/finance-data'
import { formatEuro } from '@/lib/utils'
import {
  thisMonthYM, monthLabel, expandRevenueForMonth, recurringActiveInMonth,
  normalizeInvoiceStatus, type RevenueEntry, type RecurringInvoice,
} from '@/lib/invoices'
import { TrendingUp, Receipt, ArrowRight } from 'lucide-react'

// "Deze maand": Prognose · Gefactureerd · Kosten · Winst + voortgangsbalk Facturatie voltooid.
export async function FinanceWidget() {
  let prognose = 0, gefactureerd = 0, kosten = 0
  let month = thisMonthYM()
  try {
    const admin = createAdminSupabaseClient()
    month = thisMonthYM()
    const [{ data: revenue }, { data: invoices }, { data: recurring }, { data: recMonths }] = await Promise.all([
      admin.from('revenue_entries').select('*'),
      admin.from('invoices').select('amount_excl, status').eq('invoice_month', month),
      admin.from('recurring_invoices').select('*'),
      admin.from('recurring_invoice_months').select('recurring_id, status').eq('month', month),
    ])

    prognose = expandRevenueForMonth((revenue ?? []) as RevenueEntry[], month).reduce((s, x) => s + x.amount_excl, 0)

    for (const i of (invoices ?? []) as { amount_excl: number; status: string }[]) {
      if (normalizeInvoiceStatus(i.status) !== 'geannuleerd') gefactureerd += Number(i.amount_excl) || 0
    }
    const statusByRec = new Map((recMonths ?? []).map((m: { recurring_id: string; status: string }) => [m.recurring_id, m.status]))
    for (const r of (recurring ?? []) as RecurringInvoice[]) {
      if (!recurringActiveInMonth(r, month)) continue
      if (normalizeInvoiceStatus(statusByRec.get(r.id) ?? 'te_versturen') !== 'geannuleerd') gefactureerd += Number(r.amount_excl) || 0
    }

    const core = await loadCore(Number(month.slice(0, 4)))
    kosten = core.monthly[new Date().getMonth()]?.kostenManual ?? 0
  } catch {
    return null // tabellen nog niet aangemaakt → widget verbergen
  }

  if (prognose === 0 && gefactureerd === 0 && kosten === 0) return null

  const winst = gefactureerd - kosten
  const pct = prognose > 0 ? Math.min(100, Math.round((gefactureerd / prognose) * 100)) : (gefactureerd > 0 ? 100 : 0)
  const pctColor = pct >= 100 ? 'bg-green-500' : pct > 0 ? 'bg-amber-500' : 'bg-red-500'

  const cells = [
    { label: 'Prognose', value: formatEuro(prognose), color: 'text-gray-900' },
    { label: 'Gefactureerd', value: formatEuro(gefactureerd), color: 'text-green-600' },
    { label: 'Kosten', value: formatEuro(kosten), color: 'text-red-600' },
    { label: 'Winst', value: formatEuro(winst), color: winst >= 0 ? 'text-green-600' : 'text-red-600' },
  ]

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-gray-400" />Deze maand · <span className="capitalize font-normal text-gray-500">{monthLabel(month)}</span></h2>
        <Link href="/admin/invoices" className="text-xs text-gray-400 hover:text-black flex items-center gap-1"><Receipt className="h-3 w-3" />Facturen <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        {cells.map((c) => (
          <div key={c.label} className="rounded-xl border border-gray-100 p-3">
            <div className="text-[11px] text-gray-500">{c.label}</div>
            <div className={`mt-0.5 text-lg font-bold ${c.color}`}>{c.value}</div>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-[11px] text-gray-500 mb-1"><span>Facturatie voltooid</span><span className="font-semibold">{pct}%</span></div>
      <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pctColor} transition-all`} style={{ width: `${pct}%` }} /></div>
    </div>
  )
}
