import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { WebsiteRequestClient } from './website-request-client'
import { requirePortalView, sessionCan } from '@/lib/portal-auth'

export default async function PortalWebsitePage() {
  const session = await requirePortalView('website')
  const canRequest = sessionCan(session, 'website', 'request_maintenance')
  const admin = createAdminSupabaseClient()

  // Check webdesign service
  const { data: service } = await admin
    .from('client_services')
    .select('active, config')
    .eq('client_id', session.clientId)
    .eq('service_slug', 'webdesign')
    .maybeSingle()

  const { data: requests } = await admin
    .from('webdesign_change_requests')
    .select('id, title, description, kind, status, created_at')
    .eq('client_id', session.clientId)
    .order('created_at', { ascending: false })

  if (!service?.active) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-sm">Website-module is niet actief voor uw account.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Website aanpassingen</h1>
        <p className="text-sm text-gray-500 mt-0.5">Kleine aanpassingen aan uw website aanvragen</p>
      </div>

      <WebsiteRequestClient
        clientId={session.clientId}
        canRequest={canRequest}
        initialRequests={(requests ?? []).map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          kind: r.kind,
          status: r.status,
          created_at: r.created_at,
        }))}
      />
    </div>
  )
}
