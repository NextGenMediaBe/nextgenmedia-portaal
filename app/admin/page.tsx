export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { LifecycleWidgets } from './lifecycle-widgets'
import { ClientTasksWidget } from './client-tasks-widget'
import { FramerStatusWidget } from './framer-status-widget'
import { BlogStatusWidget } from './blog-status-widget'
import { FinanceWidget } from './finance-widget'
import { ContractsWidget } from './contracts-widget'
import { TodayPanel } from './today-panel'
import { createClient } from '@/lib/supabase/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate, SERVICE_LABELS } from '@/lib/utils'
import Link from 'next/link'
import {
  Clock,
  AlertTriangle,
  Users,
  ArrowRight,
  Bell,
  CalendarClock,
} from 'lucide-react'

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ready_for_review: 'bg-amber-100 text-amber-700',
    changes_requested: 'bg-red-100 text-red-700',
    approved: 'bg-green-100 text-green-700',
    draft: 'bg-gray-100 text-gray-600',
    sent: 'bg-blue-100 text-blue-700',
    signed: 'bg-green-100 text-green-700',
    new: 'bg-blue-100 text-blue-700',
    in_review: 'bg-amber-100 text-amber-700',
    open: 'bg-orange-100 text-orange-700',
    invited: 'bg-purple-100 text-purple-700',
  }
  const labels: Record<string, string> = {
    ready_for_review: 'Bij klant',
    changes_requested: 'Feedback',
    approved: 'Goedgekeurd',
    draft: 'Concept',
    sent: 'Verstuurd',
    signed: 'Getekend',
    new: 'Nieuw',
    in_review: 'In review',
    open: 'Open',
    invited: 'Uitgenodigd',
  }
  return (
    <span className={`status-badge ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  )
}

function SectionHeader({ title, count, href }: { title: string; count?: number; href?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2">
        {title}
        {count !== undefined && (
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {count}
          </span>
        )}
      </h2>
      {href && (
        <Link href={href} className="text-xs text-gray-400 hover:text-black flex items-center gap-1">
          Alles <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  )
}

export default async function CommandCenter() {
  let supabaseAdmin: Awaited<ReturnType<typeof createAdminSupabaseClient>> | null = null
  try {
    supabaseAdmin = createAdminSupabaseClient()
  } catch {
    // No service role key configured
  }

  const supabase = await createClient()

  const today = new Date()
  const todayISO = today.toISOString().slice(0, 10)
  const in14ISO = new Date(today.getTime() + 14 * 86400000).toISOString().slice(0, 10)

  let clients: Array<{
    id: string
    company_name: string
  }> = []
  let pendingScripts: Array<{
    id: string
    client_id: string
    title: string
    platform: string
    planned_date: string
    status: string
    client_name?: string
  }> = []
  let rejectedScripts: typeof pendingScripts = []
  let pendingContracts: Array<{
    id: string
    title: string
    status: string
    created_at: string
    client_name?: string
  }> = []
  let openWebdesign: Array<{
    id: string
    client_id: string
    title: string
    status: string
    kind: string
    created_at: string
    client_name?: string
  }> = []
  let openAssignments: Array<{
    id: string
    title: string
    service_slug: string | null
    status: string
    client_id: string | null
    deadline: string | null
    freelancer_id: string | null
    client_name?: string
  }> = []
  let expiringContracts: Array<{
    id: string
    client_id: string
    service_slug: string
    end_date: string
    daysLeft: number
    client_name?: string
  }> = []

  // Exacte tellingen (los van de gelimiteerde lijsten hierboven) zodat de cijfers
  // op het dashboard altijd het echte totaal tonen.
  let pendingScriptsCount = 0
  let rejectedScriptsCount = 0
  let pendingContractsCount = 0
  let openWebdesignCount = 0
  let openAssignmentsCount = 0

  if (supabaseAdmin) {
    const db = supabaseAdmin
    const [
      clientsRes,
      pendingScriptsRes,
      rejectedScriptsRes,
      pendingContractsRes,
      openWebdesignRes,
      openAssignmentsRes,
      serviceContractsRes,
    ] = await Promise.all([
      db.from('clients').select('id, company_name'),
      db.from('social_content_items')
        .select('id, client_id, title, platform, planned_date, status', { count: 'exact' })
        .eq('status', 'ready_for_review')
        .order('planned_date', { ascending: true })
        .limit(20),
      db.from('social_content_items')
        .select('id, client_id, title, platform, planned_date, status, client_feedback', { count: 'exact' })
        .eq('status', 'changes_requested')
        .order('created_at', { ascending: false })
        .limit(20),
      db.from('contracts')
        .select('id, title, status, created_at, client_id', { count: 'exact' })
        .in('status', ['sent'])
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('webdesign_change_requests')
        .select('id, client_id, title, status, kind, created_at', { count: 'exact' })
        .in('status', ['new', 'in_review'])
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('freelancer_assignments')
        .select('id, title, service_slug, status, client_id, deadline, freelancer_id', { count: 'exact' })
        .in('status', ['open', 'in_progress'])
        .order('created_at', { ascending: false })
        .limit(10),
      db.from('service_contracts')
        .select('id, client_id, service_slug, end_date')
        .not('end_date', 'is', null)
        .order('end_date', { ascending: true })
        .limit(30),
    ])

    clients = (clientsRes.data ?? []) as typeof clients
    const cmap = new Map(clients.map((c) => [c.id, c.company_name]))
    const enrich = <T extends { client_id: string | null }>(arr: T[] | null) =>
      (arr ?? []).map((r) => ({
        ...r,
        client_name: r.client_id ? cmap.get(r.client_id) ?? '—' : '—',
      }))

    pendingScripts = enrich(pendingScriptsRes.data)
    rejectedScripts = enrich(rejectedScriptsRes.data as typeof pendingScripts)
    pendingContracts = enrich(pendingContractsRes.data as Array<{ id: string; title: string; status: string; created_at: string; client_id: string | null }>)
    openWebdesign = enrich(openWebdesignRes.data)
    openAssignments = enrich(openAssignmentsRes.data as typeof openAssignments)

    // Echte totalen (vallen terug op de lijstlengte als count ontbreekt)
    pendingScriptsCount = pendingScriptsRes.count ?? pendingScripts.length
    rejectedScriptsCount = rejectedScriptsRes.count ?? rejectedScripts.length
    pendingContractsCount = pendingContractsRes.count ?? pendingContracts.length
    openWebdesignCount = openWebdesignRes.count ?? openWebdesign.length
    openAssignmentsCount = openAssignmentsRes.count ?? openAssignments.length

    // Service contracts expiry
    const todayMs = Date.now()
    expiringContracts = ((serviceContractsRes.data ?? []) as Array<{ id: string; client_id: string; service_slug: string; end_date: string }>)
      .map((sc) => {
        const end = new Date(sc.end_date)
        const daysLeft = Math.round((end.getTime() - todayMs) / 86400000)
        return { ...sc, daysLeft, client_name: cmap.get(sc.client_id) ?? '—' }
      })
      .filter((sc) => sc.daysLeft <= 90) // only show contracts expiring within 90 days (or expired)
      .sort((a, b) => a.daysLeft - b.daysLeft)
  } else {
    const clientsRes = await supabase.from('clients').select('id, company_name')
    clients = (clientsRes.data ?? []) as typeof clients
  }

  const renewalClients: typeof clients = []

  const totalPending = pendingScriptsCount + rejectedScriptsCount
  const totalAlerts = renewalClients.length + pendingContractsCount + totalPending

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {today.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Vandaag — dagelijkse acties (bovenaan, de werkplek) */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Vandaag laden…</div>}>
        <TodayPanel />
      </Suspense>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Klanten</span>
            <Users className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold">{clients.length}</div>
          <div className="text-xs text-gray-400 mt-1">Actief</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Scripts</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600">{pendingScriptsCount}</div>
          <div className="text-xs text-gray-400 mt-1">Wachten op goedkeuring</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Feedback</span>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </div>
          <div className="text-2xl font-bold text-red-600">{rejectedScriptsCount}</div>
          <div className="text-xs text-gray-400 mt-1">Aanpassing gevraagd</div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Meldingen</span>
            <Bell className="h-4 w-4 text-gray-400" />
          </div>
          <div className="text-2xl font-bold">{totalAlerts}</div>
          <div className="text-xs text-gray-400 mt-1">Actievereist</div>
        </div>
      </div>

      {/* Financiën deze maand: prognose / gefactureerd / kosten / winst */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Financiën laden…</div>}>
        <FinanceWidget />
      </Suspense>

      {/* Contracten — status + opvolging */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Contracten laden…</div>}>
        <ContractsWidget />
      </Suspense>

      {/* Klant-lifecycle widgets (batch, reviews, contractverlengingen) */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Lifecycle laden…</div>}>
        <LifecycleWidgets />
      </Suspense>

      {/* Open klanttaken */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Taken laden…</div>}>
        <ClientTasksWidget />
      </Suspense>

      {/* Blog status */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Blogs laden…</div>}>
        <BlogStatusWidget />
      </Suspense>

      {/* Framer status */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Framer laden…</div>}>
        <FramerStatusWidget />
      </Suspense>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Scripts pending review */}
        <div className="card-base">
          <SectionHeader
            title="Scripts — bij klant"
            count={pendingScriptsCount}
            href="/admin/services/social-media"
          />
          {pendingScripts.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen scripts wachten op review</div>
          ) : (
            <div className="space-y-2">
              {pendingScripts.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/services/social-media?client=${item.client_id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors group"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                    <div className="text-xs text-gray-400">
                      {item.client_name} · {item.platform} · {formatDate(item.planned_date)}
                    </div>
                  </div>
                  <span className="status-badge bg-amber-100 text-amber-700 shrink-0 ml-2">
                    Bij klant
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Scripts with feedback */}
        <div className="card-base">
          <SectionHeader
            title="Scripts — feedback gevraagd"
            count={rejectedScriptsCount}
            href="/admin/services/social-media"
          />
          {rejectedScripts.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen openstaande feedback</div>
          ) : (
            <div className="space-y-2">
              {rejectedScripts.slice(0, 8).map((item) => (
                <Link
                  key={item.id}
                  href={`/admin/services/social-media?client=${item.client_id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                    <div className="text-xs text-gray-400">
                      {item.client_name} · {item.platform} · {formatDate(item.planned_date)}
                    </div>
                  </div>
                  <span className="status-badge bg-red-100 text-red-700 shrink-0 ml-2">
                    Feedback
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Pending contracts */}
        <div className="card-base">
          <SectionHeader
            title="Contracten — wachten"
            count={pendingContractsCount}
            href="/admin/contracts"
          />
          {pendingContracts.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen openstaande contracten</div>
          ) : (
            <div className="space-y-2">
              {pendingContracts.map((c) => (
                <Link
                  key={c.id}
                  href={`/admin/contracts/${c.id}`}
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{c.title}</div>
                    <div className="text-xs text-gray-400">
                      {c.client_name ?? '—'} · {formatDate(c.created_at)}
                    </div>
                  </div>
                  <StatusBadge status={c.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Website requests */}
        <div className="card-base">
          <SectionHeader
            title="Website onderhoudsvragen"
            count={openWebdesignCount}
            href="/admin/services/website"
          />
          {openWebdesign.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen open onderhoudsvragen</div>
          ) : (
            <div className="space-y-2">
              {openWebdesign.map((item) => (
                <Link
                  key={item.id}
                  href="/admin/services/website"
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                    <div className="text-xs text-gray-400">{item.client_name} · {item.kind}</div>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Contract expiry */}
        <div className="card-base">
          <SectionHeader
            title="Contracten die aflopen"
            count={expiringContracts.length}
            href="/admin/clients"
          />
          {expiringContracts.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen contracten die binnenkort aflopen</div>
          ) : (
            <div className="space-y-2">
              {expiringContracts.slice(0, 8).map((sc) => {
                const isExpired = sc.daysLeft < 0
                const isCritical = !isExpired && sc.daysLeft <= 14
                const isWarning = !isExpired && !isCritical && sc.daysLeft <= 30
                const badgeCls = isExpired ? 'bg-red-100 text-red-700' : isCritical ? 'bg-red-100 text-red-700' : isWarning ? 'bg-amber-100 text-amber-700' : 'bg-yellow-50 text-yellow-700'
                const statusLabel = isExpired ? 'Verlopen' : isCritical ? 'Kritiek' : isWarning ? 'Loopt af' : 'Aandacht'
                return (
                  <Link
                    key={sc.id}
                    href={`/admin/clients?q=${encodeURIComponent(sc.client_name ?? '')}`}
                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{sc.client_name}</div>
                      <div className="text-xs text-gray-400">
                        <span className="capitalize">{SERVICE_LABELS[sc.service_slug] ?? sc.service_slug?.replace(/-/g, ' ')}</span>
                        {' · '}einddatum {formatDate(sc.end_date)}
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className={`status-badge ${badgeCls}`}>{statusLabel}</span>
                      <span className={`text-[11px] mt-0.5 ${isExpired || isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-gray-400'}`}>
                        {isExpired ? `${Math.abs(sc.daysLeft)}d verlopen` : `nog ${sc.daysLeft}d`}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* Open assignments */}
        <div className="card-base">
          <SectionHeader
            title="Openstaande opdrachten"
            count={openAssignmentsCount}
            href="/admin/assignments"
          />
          {openAssignments.length === 0 ? (
            <div className="text-sm text-gray-400 py-4 text-center">Geen openstaande opdrachten</div>
          ) : (
            <div className="space-y-2">
              {openAssignments.map((item) => (
                <Link
                  key={item.id}
                  href="/admin/assignments"
                  className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{item.title}</div>
                    <div className="text-xs text-gray-400">
                      {item.client_name}
                      {item.deadline ? ` · ${formatDate(item.deadline)}` : ''}
                    </div>
                  </div>
                  <StatusBadge status={item.status} />
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
