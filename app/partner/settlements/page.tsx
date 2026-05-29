import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatEuro, formatDate, SERVICE_LABELS } from '@/lib/utils'
import { ArrowLeftRight, TrendingUp, CheckCircle2, Clock } from 'lucide-react'

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

  const { data: assignments } = await supabase
    .from('freelancer_assignments')
    .select('id, title, status, payout, budget, service_slug, deadline, created_at, clients(company_name)')
    .eq('freelancer_id', partner.id)
    .order('created_at', { ascending: false })

  const all = assignments ?? []
  const completed = all.filter((a) => a.status === 'completed')
  const pending = all.filter((a) => ['open', 'in_progress'].includes(a.status))

  const totalPaid = completed.reduce((s, a) => s + (a.payout ?? 0), 0)
  const totalPending = pending.reduce((s, a) => s + (a.payout ?? 0), 0)

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Settlements</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overzicht van uw vergoedingen en uitbetalingen</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Totaal verdiend</span>
          </div>
          <div className="text-2xl font-bold">{formatEuro(totalPaid)}</div>
          <div className="text-xs text-gray-400 mt-1">{completed.length} afgeronde opdrachten</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-gray-500 font-medium">Te verwachten</span>
          </div>
          <div className="text-2xl font-bold">{formatEuro(totalPending)}</div>
          <div className="text-xs text-gray-400 mt-1">{pending.length} lopende opdrachten</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight className="h-4 w-4 text-[#c5b800]" />
            <span className="text-xs text-gray-500 font-medium">Commissie %</span>
          </div>
          <div className="text-2xl font-bold">{partner.commission_pct ?? 10}%</div>
          {partner.hourly_rate && (
            <div className="text-xs text-gray-400 mt-1">Uurtarief: {formatEuro(partner.hourly_rate)}/u</div>
          )}
        </div>
      </div>

      {/* Completed assignments */}
      <div className="card-base">
        <h2 className="font-semibold text-gray-900 mb-4">Afgeronde opdrachten</h2>
        {completed.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nog geen afgeronde opdrachten</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">Opdracht</th>
                  <th className="table-th">Klant</th>
                  <th className="table-th">Dienst</th>
                  <th className="table-th">Datum</th>
                  <th className="table-th text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {completed.map((a) => (
                  <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="table-td font-medium">{a.title}</td>
                    <td className="table-td text-gray-500">
                      {a.clients ? (a.clients as unknown as { company_name: string }).company_name : '—'}
                    </td>
                    <td className="table-td text-gray-500">
                      {a.service_slug ? (SERVICE_LABELS[a.service_slug] ?? a.service_slug) : '—'}
                    </td>
                    <td className="table-td text-gray-500">{formatDate(a.created_at)}</td>
                    <td className="table-td text-right font-semibold text-green-700">
                      {a.payout != null ? formatEuro(a.payout) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200">
                  <td colSpan={4} className="table-td font-semibold text-right pr-4">Totaal</td>
                  <td className="table-td text-right font-bold text-green-700">{formatEuro(totalPaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Pending */}
      {pending.length > 0 && (
        <div className="card-base">
          <h2 className="font-semibold text-gray-900 mb-4">Te verwachten uitbetalingen</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="table-th">Opdracht</th>
                  <th className="table-th">Klant</th>
                  <th className="table-th">Status</th>
                  <th className="table-th">Deadline</th>
                  <th className="table-th text-right">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="table-td font-medium">{a.title}</td>
                    <td className="table-td text-gray-500">
                      {a.clients ? (a.clients as unknown as { company_name: string }).company_name : '—'}
                    </td>
                    <td className="table-td">
                      <span className={`status-badge ${a.status === 'in_progress' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {a.status === 'in_progress' ? 'Actief' : 'Openstaand'}
                      </span>
                    </td>
                    <td className="table-td text-gray-500">
                      {a.deadline ? formatDate(a.deadline) : '—'}
                    </td>
                    <td className="table-td text-right font-semibold text-amber-700">
                      {a.payout != null ? formatEuro(a.payout) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
