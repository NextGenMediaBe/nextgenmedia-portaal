export const dynamic = 'force-dynamic'

import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatEuro, formatDate } from '@/lib/utils'
import { ArrowLeftRight, TrendingUp, TrendingDown, Wallet } from 'lucide-react'

const KIND_LABEL: Record<string, string> = {
  payout_owed: 'Uitbetaling',
  commission_owed: 'Commissie',
  service_billed: 'Onderaanneming',
  manual_credit: 'Tegoed',
  manual_debit: 'Debet',
  settlement: 'Afrekening',
}

export default async function PartnerSettlementsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: partner } = await supabase
    .from('freelancers')
    .select('id, name, commission_pct, hourly_rate')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!partner) redirect('/login')

  // Real money flows live in the ledger. select('*') so the direction column is
  // included regardless of schema version.
  const admin = createAdminSupabaseClient()
  const [{ data: ledgerRows }, { data: settlementRows }] = await Promise.all([
    admin.from('partner_ledger_entries')
      .select('*')
      .eq('freelancer_id', partner.id)
      .order('occurred_on', { ascending: false }),
    admin.from('partner_settlements')
      .select('*')
      .eq('freelancer_id', partner.id)
      .order('created_at', { ascending: false }),
  ])

  type Ledger = {
    id: string; kind: string; status: string; amount: number; direction?: string | null
    description: string | null; occurred_on: string
  }
  const ledger = (ledgerRows ?? []) as Ledger[]
  const settlements = (settlementRows ?? []) as Array<{
    id: string; period_start: string; period_end: string; net_amount: number
    status: string; notes: string | null; created_at: string
  }>

  const dirOf = (l: Ledger): 'we_pay_partner' | 'partner_pays_us' =>
    l.direction === 'partner_pays_us' || l.direction === 'we_pay_partner'
      ? l.direction
      : (Number(l.amount) >= 0 ? 'we_pay_partner' : 'partner_pays_us')

  const pending = ledger.filter((l) => l.status === 'pending')
  const owedToPartner = pending.filter((l) => dirOf(l) === 'we_pay_partner').reduce((s, l) => s + Math.abs(l.amount), 0)
  const owedByPartner = pending.filter((l) => dirOf(l) === 'partner_pays_us').reduce((s, l) => s + Math.abs(l.amount), 0)
  const net = owedToPartner - owedByPartner

  // Lifetime paid out to partner (settled + we_pay_partner)
  const lifetimeEarned = ledger
    .filter((l) => l.status !== 'cancelled' && dirOf(l) === 'we_pay_partner')
    .reduce((s, l) => s + Math.abs(l.amount), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Wat wij u betalen en wat u ons betaalt</p>
      </div>

      {/* Balance — both directions + net */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Wij betalen u</span>
          </div>
          <div className="text-2xl font-bold text-green-600">{formatEuro(owedToPartner)}</div>
          <div className="text-xs text-gray-400 mt-1">openstaand</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="h-4 w-4 text-red-500" />
            <span className="text-xs text-gray-500 font-medium">U betaalt ons</span>
          </div>
          <div className="text-2xl font-bold text-red-600">{formatEuro(owedByPartner)}</div>
          <div className="text-xs text-gray-400 mt-1">openstaand</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="h-4 w-4 text-[#c5b800]" />
            <span className="text-xs text-gray-500 font-medium">Netto saldo</span>
          </div>
          <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : ''}{formatEuro(net)}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {net >= 0 ? 'wij betalen u' : 'u betaalt ons'}
          </div>
        </div>
      </div>

      {/* Open items */}
      <div className="card-base">
        <h2 className="font-semibold text-gray-900 mb-4">Openstaande posten</h2>
        {pending.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <ArrowLeftRight className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Geen openstaande posten</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Datum</th>
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Richting</th>
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Type</th>
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Omschrijving</th>
                  <th className="text-right py-2 text-xs text-gray-500 font-medium">Bedrag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pending.map((l) => {
                  const wePay = dirOf(l) === 'we_pay_partner'
                  return (
                    <tr key={l.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 text-gray-500 text-xs">{formatDate(l.occurred_on)}</td>
                      <td className="py-2.5">
                        <span className={`status-badge text-xs ${wePay ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {wePay ? 'Wij betalen u' : 'U betaalt ons'}
                        </span>
                      </td>
                      <td className="py-2.5 text-xs text-gray-600">{KIND_LABEL[l.kind] ?? l.kind}</td>
                      <td className="py-2.5 text-gray-700 max-w-[220px] truncate">{l.description ?? '—'}</td>
                      <td className={`py-2.5 text-right font-semibold ${wePay ? 'text-green-600' : 'text-red-600'}`}>
                        {wePay ? '+' : '−'}{formatEuro(Math.abs(l.amount))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="py-2.5 font-semibold text-right pr-4">Netto saldo</td>
                  <td className={`py-2.5 text-right font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {net >= 0 ? '+' : ''}{formatEuro(net)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Settlement history */}
      {settlements.length > 0 && (
        <div className="card-base">
          <h2 className="font-semibold text-gray-900 mb-4">Afrekenhistorie</h2>
          <div className="space-y-2">
            {settlements.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-gray-50 flex-wrap">
                <div className="text-sm">
                  <span className="font-medium">{formatDate(s.period_start)} → {formatDate(s.period_end)}</span>
                  {s.notes && <span className="text-gray-400 ml-2">{s.notes}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-bold ${s.net_amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {s.net_amount >= 0 ? 'Wij betalen u: ' : 'U betaalt ons: '}{formatEuro(Math.abs(s.net_amount))}
                  </span>
                  <span className={`status-badge text-xs ${
                    s.status === 'paid' ? 'bg-green-100 text-green-700' :
                    s.status === 'finalized' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {s.status === 'paid' ? 'Betaald' : s.status === 'finalized' ? 'Definitief' : 'Concept'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer info */}
      <div className="card-base">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Totaal door ons uitbetaald (alle tijd):</span>
            <span className="font-semibold ml-2">{formatEuro(lifetimeEarned)}</span>
          </div>
          {partner.hourly_rate != null && (
            <div>
              <span className="text-gray-500">Uw uurtarief:</span>
              <span className="font-semibold ml-2">{formatEuro(partner.hourly_rate)}/u</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
