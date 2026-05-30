export const dynamic = 'force-dynamic'

import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatEuro, formatDate } from '@/lib/utils'
import { Briefcase, CheckCircle2, Clock, AlertCircle, TrendingUp, Plus } from 'lucide-react'
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

  // Separate queries — no FK joins (avoids silent PostgREST failures)
  const { data: assignments } = await supabase
    .from('freelancer_assignments')
    .select('id, title, description, status, budget, payout, deadline, created_at, client_id')
    .eq('freelancer_id', partner.id)
    .order('created_at', { ascending: false })

  // Fetch client names via admin client (RLS prevents direct client access for partners)
  const clientIds = Array.from(new Set((assignments ?? []).map((a) => a.client_id).filter((v): v is string => !!v)))
  let clientMap = new Map<string, string>()
  if (clientIds.length > 0) {
    const admin = createAdminSupabaseClient()
    const { data: clients } = await admin.from('clients').select('id, company_name').in('id', clientIds)
    clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name]))
  }

  const all = (assignments ?? []).map((a) => ({
    ...a,
    client_name: a.client_id ? (clientMap.get(a.client_id) ?? null) : null,
  }))

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Welkom terug, {partner.name}</p>
        </div>
        <Link href="/partner/assignments" className="btn-primary">
          <Plus className="h-4 w-4" />
          Opdracht indienen
        </Link>
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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900">Lopende opdrachten</h2>
          <Link href="/partner/assignments" className="text-xs text-gray-500 hover:text-black">
            Alle opdrachten →
          </Link>
        </div>
        {[...active, ...open].length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Geen actieve opdrachten</p>
            <Link href="/partner/assignments" className="btn-primary mt-4 inline-flex text-sm">
              <Plus className="h-4 w-4" />
              Opdracht indienen
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {[...active, ...open].map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{a.title}</div>
                  {a.client_name && (
                    <div className="text-xs text-gray-400 mt-0.5">{a.client_name}</div>
                  )}
                  {a.deadline && (
                    <div className="text-xs text-gray-400 mt-0.5">Deadline: {formatDate(a.deadline)}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(a.payout ?? a.budget) != null && (
                    <span className="text-sm font-semibold">{formatEuro(a.payout ?? a.budget)}</span>
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

      {/* Commission info */}
      <div className="card-base">
        <h2 className="font-semibold text-gray-900 mb-3">Uw tarieven</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Commissie op referrals:</span>
            <span className="font-semibold ml-2">{partner.commission_pct ?? 10}%</span>
          </div>
          {partner.hourly_rate && (
            <div>
              <span className="text-gray-500">Uurtarief:</span>
              <span className="font-semibold ml-2">{formatEuro(partner.hourly_rate)}/u</span>
            </div>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Wil je uw tarieven aanpassen? Neem contact op met NextGenMedia.
        </p>
      </div>
    </div>
  )
}
