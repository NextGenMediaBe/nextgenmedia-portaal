export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate, formatEuro } from '@/lib/utils'
import { ArrowLeftRight, TrendingUp, TrendingDown } from 'lucide-react'

async function getData() {
  try {
    const admin = createAdminSupabaseClient()
    const [{ data: assignmentRows }, { data: partnerRows }, { data: clientRows }] = await Promise.all([
      admin.from('freelancer_assignments')
        .select('id, title, budget, payout, deadline, created_at, freelancer_id, client_id')
        .in('status', ['completed'])
        .order('created_at', { ascending: false }),
      admin.from('freelancers')
        .select('id, name, commission_pct')
        .eq('active', true)
        .order('name'),
      admin.from('clients').select('id, company_name'),
    ])

    const freelancerMap = new Map((partnerRows ?? []).map((f) => [f.id, f as { id: string; name: string; commission_pct: number | null }]))
    const clientMap = new Map((clientRows ?? []).map((c) => [c.id, c as { id: string; company_name: string }]))

    const assignments = (assignmentRows ?? []).map((a) => ({
      ...a,
      freelancers: a.freelancer_id ? (freelancerMap.get(a.freelancer_id) ?? null) : null,
      clients: a.client_id ? { company_name: clientMap.get(a.client_id)?.company_name ?? '' } : null,
    }))

    return { assignments, partners: partnerRows ?? [] }
  } catch {
    return { assignments: [], partners: [] }
  }
}

type DoneAssignment = {
  id: string
  title: string
  budget: number | null
  deadline: string | null
  created_at: string
  freelancers: { id: string; name: string; commission_pct: number | null } | null
  clients: { company_name: string } | null
}

export default async function SettlementsPage() {
  const { assignments, partners } = await getData()

  // Group by partner
  const byPartner = new Map<string, {
    partner: { id: string; name: string; commission_pct: number | null }
    assignments: DoneAssignment[]
    totalPayout: number
    totalCommission: number
  }>()

  for (const a of assignments as DoneAssignment[]) {
    if (!a.freelancers) continue
    const partnerId = a.freelancers.id
    if (!byPartner.has(partnerId)) {
      byPartner.set(partnerId, {
        partner: a.freelancers,
        assignments: [],
        totalPayout: 0,
        totalCommission: 0,
      })
    }
    const entry = byPartner.get(partnerId)!
    entry.assignments.push(a)
    const payout = a.budget ?? 0
    const commissionPct = a.freelancers.commission_pct ?? 10
    entry.totalPayout += payout
    entry.totalCommission += payout * (commissionPct / 100)
  }

  const totalPayouts = [...byPartner.values()].reduce((s, e) => s + e.totalPayout, 0)
  const totalCommissions = [...byPartner.values()].reduce((s, e) => s + e.totalCommission, 0)
  const netBalance = totalCommissions - totalPayouts

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overzicht van balansen tussen NextGenMedia en partners</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Totaal te betalen</span>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">{formatEuro(totalPayouts)}</div>
          <div className="text-xs text-gray-400 mt-1">Aan partners</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Commissies</span>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </div>
          <div className="text-2xl font-bold text-green-600">{formatEuro(totalCommissions)}</div>
          <div className="text-xs text-gray-400 mt-1">Van partners te ontvangen</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Nettosaldo</span>
            <ArrowLeftRight className="h-4 w-4 text-gray-400" />
          </div>
          <div className={`text-2xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatEuro(Math.abs(netBalance))}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {netBalance >= 0 ? 'In ons voordeel' : 'Wij moeten betalen'}
          </div>
        </div>
      </div>

      {/* Per partner */}
      <div className="space-y-4">
        <h2 className="font-semibold text-gray-900">Per partner</h2>
        {byPartner.size === 0 ? (
          <div className="card-base text-center py-10 text-gray-400">
            <ArrowLeftRight className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nog geen afgeronde opdrachten voor settlements</p>
          </div>
        ) : (
          [...byPartner.values()].map(({ partner, assignments, totalPayout, totalCommission }) => {
            const balance = totalCommission - totalPayout
            return (
              <div key={partner.id} className="card-base">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-semibold">{partner.name}</h3>
                    <div className="text-xs text-gray-400">{assignments.length} afgeronde opdrachten · Commissie {partner.commission_pct ?? 10}%</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Saldo</div>
                    <div className={`font-bold text-lg ${balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {balance >= 0 ? '+' : '-'}{formatEuro(Math.abs(balance))}
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 text-xs text-gray-500 font-medium">Opdracht</th>
                        <th className="text-left py-2 text-xs text-gray-500 font-medium">Klant</th>
                        <th className="text-right py-2 text-xs text-gray-500 font-medium">Payout</th>
                        <th className="text-right py-2 text-xs text-gray-500 font-medium">Commissie</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {assignments.map((a) => {
                        const payout = a.budget ?? 0
                        const comm = payout * ((partner.commission_pct ?? 10) / 100)
                        return (
                          <tr key={a.id}>
                            <td className="py-2 text-gray-700">{a.title}</td>
                            <td className="py-2 text-gray-500">{a.clients?.company_name ?? '—'}</td>
                            <td className="py-2 text-right text-red-600">{formatEuro(payout)}</td>
                            <td className="py-2 text-right text-green-600">{formatEuro(comm)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-gray-200 font-semibold">
                        <td colSpan={2} className="py-2">Totaal</td>
                        <td className="py-2 text-right text-red-600">{formatEuro(totalPayout)}</td>
                        <td className="py-2 text-right text-green-600">{formatEuro(totalCommission)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
