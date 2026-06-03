import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PortalCalendar } from './portal-calendar'
import { ShootBriefingView, type Shoot } from '@/components/portal/shoot-briefing-view'
import { type Feedback } from '@/components/portal/shoot-feedback'

type FeedbackRow = Feedback & { shoot_id: string }

export default async function PortalSocialMediaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase
    .from('clients').select('id, company_name').eq('owner_user_id', user.id).maybeSingle()
  if (!client) redirect('/portal')

  // Guard: redirect if client doesn't have social-media service
  const { data: svcRow } = await supabase
    .from('client_services')
    .select('active')
    .eq('client_id', client.id)
    .eq('service_slug', 'social-media')
    .maybeSingle()
  if (!svcRow?.active) redirect('/portal')

  const { data: items } = await supabase
    .from('social_content_items')
    .select('*')
    .eq('client_id', client.id)
    .order('planned_date', { ascending: true })

  // Shoot briefings (RLS: klant leest eigen). Resilient: tabel kan nog ontbreken
  // vóór de migratie → dan gewoon geen sectie.
  const { data: shootRows } = await supabase
    .from('shoot_briefings')
    .select('*')
    .eq('client_id', client.id)
    .order('shoot_date', { ascending: false, nullsFirst: false })
  const shoots = (shootRows ?? []) as Shoot[]

  // Feedback per shoot (RLS: klant leest eigen)
  const feedbackByShoot: Record<string, FeedbackRow[]> = {}
  if (shoots.length > 0) {
    const { data: fbRows } = await supabase
      .from('shoot_briefing_feedback')
      .select('*')
      .in('shoot_id', shoots.map((s) => s.id))
      .order('created_at', { ascending: true })
    for (const f of (fbRows ?? []) as FeedbackRow[]) {
      ;(feedbackByShoot[f.shoot_id] ??= []).push(f)
    }
  }

  const pendingCount = (items ?? []).filter((i) => i.status === 'ready_for_review').length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Social Media Kalender</h1>
          <p className="text-sm text-gray-500 mt-0.5">{client.company_name}</p>
        </div>
        {pendingCount > 0 && (
          <div className="status-badge bg-amber-100 text-amber-700 text-sm px-3 py-1.5">
            {pendingCount} wachten op goedkeuring
          </div>
        )}
      </div>

      <ShootBriefingView shoots={shoots} feedbackByShoot={feedbackByShoot} />

      <PortalCalendar
        initialItems={(items ?? []).map((it) => ({
          ...it,
          platforms: Array.isArray(it.platforms) ? it.platforms : it.platform ? [it.platform] : [],
        }))}
        clientId={client.id}
      />
    </div>
  )
}
