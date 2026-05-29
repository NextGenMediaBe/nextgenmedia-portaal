import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatEuro, formatDate } from '@/lib/utils'
import { Briefcase, CheckCircle2, Clock, AlertCircle, TrendingUp } from 'lucide-react'
import Link from 'next/link'

export default async function PartnerDashboard() {
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
    .select('id, title, description, status, budget, payout, deadline, created_at, client_id, clients(company_name)')
    .eq('freelancer_id', partner.id)
    .order('created_at', { ascending: false })

  const all = assignments ?? []
  const open = all.filter((a) => a.status === 'open')
  const active = all.filter((a) => a.status === 'in_progress')
  const done = all.filter((a) => a.status === 'completed')
  const totalEarned = done.reduce((s, a) => s + (a.payout ?? 0), 0)

  const STATUS_STYLE: Record<string, string> = {
    open: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-purple-100 text-purple-700',
    completed: 'bg-green-100 text-green-700',
    cancelled: 'bg-gray-100 text-gray-500',
  }
  const STATUS_LABEL: Record<string, string> = {
    open: 'Openstaand', in_progress: 'Actief', completed: 'Afgerond', cancelled: 'Geannuleerd',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Welkom terug, {partner.name}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <AlertCircle className="h-4 w-4 text-blue-500" />
            <span className="text-xs text-gray-500 font-medium">Openstaand</span>
          </div>
          <div className="text-2xl font-bold">{open.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-purple-500" />
            <span className="text-xs text-gray-500 font-medium">Actief</span>
          </div>
          <div className="text-2xl font-bold">{active.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span className="text-xs text-gray-500 font-medium">Afgerond</span>
          </div>
          <div className="text-2xl font-bold">{done.length}</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-[#c5b800]" />
            <span className="text-xs text-gray-500 font-medium">Totaal verdiend</span>
          </div>
          <div className="text-2xl font-bold">{formatEuro(totalEarned)}</div>
        </div>
      </div>

      {/* Active & Open assignments */}
      <div className="card-base">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Lopende opdrachten</h2>
          <Link href="/partner/assignments" className="text-xs text-gray-500 hover:text-black">
            Alle opdrachten →
          </Link>
        </div>
        {[...active, ...open].length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Geen actieve opdrachten</p>
          </div>
        ) : (
          <div className="space-y-3">
            {[...active, ...open].map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.title}</div>
                  {a.clients && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {(a.clients as unknown as { company_name: string }).company_name}
                    </div>
                  )}
                  {a.deadline && (
                    <div className="text-xs text-gray-400 mt-0.5">Deadline: {formatDate(a.deadline)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.payout != null && (
                    <span className="text-sm font-semibold">{formatEuro(a.payout)}</span>
                  )}
                  <span className={`status-badge ${STATUS_STYLE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
