export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatEuro, normalizeDirection } from '@/lib/utils'
import { ArrowLeftRight, TrendingUp, TrendingDown, Wallet, ChevronRight } from 'lucide-react'
import Link from 'next/link'

type LedgerRow = {
  id: string
  freelancer_id: string
  status: string
  amount: number
  direction?: string | null
}

type PartnerRow = { id: string; name: string | null }
type SettlementRow = { freelancer_id: string; status: string }

async function getData() {
  try {
    const admin = createAdminSupabaseClient()
    const [{ data: partnerRows }, { data: ledgerRows }, { data: settlementRows }] = await Promise.all([
      admin.from('freelancers').select('id, name').order('name'),
      // select('*') so the direction column is included regardless of schema version
      admin.from('partner_ledger_entries').select('*'),
      admin.from('partner_settlements').select('freelancer_id, status'),
    ])
    return {
      partners: (partnerRows ?? []) as PartnerRow[],
      ledger: (ledgerRows ?? []) as LedgerRow[],
      settlements: (settlementRows ?? []) as SettlementRow[],
    }
  } catch {
    return { partners: [] as PartnerRow[], ledger: [] as LedgerRow[], settlements: [] as SettlementRow[] }
  }
}

export default async function SettlementsPage() {
  const { partners, ledger, settlements } = await getData()
  const partnerName = new Map(partners.map((p) => [p.id, p.name ?? 'Partner']))

  // Only pending entries count toward the open balance.
  const pending = ledger.filter((l) => l.status === 'pending')

  type Agg = { partnerId: string; owedToPartner: number; owedByPartner: number; openCount: number }
  const byPartner = new Map<string, Agg>()
  const ensure = (pid: string): Agg => {
    let a = byPartner.get(pid)
    if (!a) { a = { partnerId: pid, owedToPartner: 0, owedByPartner: 0, openCount: 0 }; byPartner.set(pid, a) }
    return a
  }

  for (const l of pending) {
    const a = ensure(l.freelancer_id)
    const dir = normalizeDirection(l.direction, l.amount)
    if (dir === 'we_pay_partner') a.owedToPartner += Math.abs(Number(l.amount))
    else a.owedByPartner += Math.abs(Number(l.amount))
    a.openCount += 1
  }

  // Count unpaid settlement records per partner (concept/definitief, not paid)
  const unpaidSettlements = new Map<string, number>()
  for (const s of settlements) {
    if (s.status !== 'paid') unpaidSettlements.set(s.freelancer_id, (unpaidSettlements.get(s.freelancer_id) ?? 0) + 1)
  }

  const rows = [...byPartner.values()]
    .map((a) => ({ ...a, net: a.owedToPartner - a.owedByPartner }))
    .filter((a) => a.openCount > 0)
    .sort((x, y) => Math.abs(y.net) - Math.abs(x.net))

  const totalWePay = rows.reduce((s, a) => s + a.owedToPartner, 0)
  const totalPartnerPays = rows.reduce((s, a) => s + a.owedByPartner, 0)
  const net = totalWePay - totalPartnerPays

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Openstaande balansen tussen NextGenMedia en partners — commissie (beide richtingen) en onderaanneming</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Wij betalen partners</span>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">{formatEuro(totalWePay)}</div>
          <div className="text-xs text-gray-400 mt-1">openstaand</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Partners betalen ons</span>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">{formatEuro(totalPartnerPays)}</div>
          <div className="text-xs text-gray-400 mt-1">openstaand</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Nettosaldo</span>
            <Wallet className="h-4 w-4 text-[#c5b800]" />
          </div>
          <div className={`text-2xl font-bold ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {net >= 0 ? '+' : '−'}{formatEuro(Math.abs(net))}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {net >= 0 ? 'wij betalen partners netto' : 'partners betalen ons netto'}
          </div>
        </div>
      </div>

      {/* Per partner */}
      <div className="space-y-4">
        <h2 className="font-semibold text-gray-900">Openstaand per partner</h2>
        {rows.length === 0 ? (
          <div className="card-base text-center py-10 text-gray-400">
            <ArrowLeftRight className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Geen openstaande posten</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((a) => {
              const unpaid = unpaidSettlements.get(a.partnerId) ?? 0
              return (
                <Link
                  key={a.partnerId}
                  href={`/admin/partners/${a.partnerId}`}
                  className="card-base flex items-center justify-between gap-4 hover:border-gray-300 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{partnerName.get(a.partnerId) ?? 'Partner'}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {a.openCount} openstaande {a.openCount === 1 ? 'post' : 'posten'}
                      {unpaid > 0 && <span className="ml-1">· {unpaid} onbetaalde afrekening{unpaid === 1 ? '' : 'en'}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-5 shrink-0">
                    <div className="text-right hidden sm:block">
                      <div className="text-[11px] text-gray-400">Wij betalen</div>
                      <div className="text-sm font-semibold text-green-600">{formatEuro(a.owedToPartner)}</div>
                    </div>
                    <div className="text-right hidden sm:block">
                      <div className="text-[11px] text-gray-400">Partner betaalt</div>
                      <div className="text-sm font-semibold text-red-600">{formatEuro(a.owedByPartner)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] text-gray-400">Netto</div>
                      <div className={`font-bold ${a.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {a.net >= 0 ? '+' : '−'}{formatEuro(Math.abs(a.net))}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-300" />
                  </div>
                </Link>
              )
            })}
          </div>
        )}
        <p className="text-xs text-gray-400">
          Netto positief = wij betalen de partner. Netto negatief = de partner betaalt ons. Klik een partner aan om
          posten af te rekenen, als betaald te markeren of te verwijderen.
        </p>
      </div>
    </div>
  )
}
