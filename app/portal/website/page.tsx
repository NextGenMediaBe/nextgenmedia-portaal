import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { WebsiteRequestClient } from './website-request-client'
import { requirePortalView, sessionCan } from '@/lib/portal-auth'
import { ExternalLink } from 'lucide-react'

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

  // Beheerlink: alleen relevant als de site een eigen beheeromgeving heeft.
  // De klant ziet enkel de knop — nooit hoe of waarmee de site gebouwd is.
  const { data: clientRow } = await admin
    .from('clients').select('website_url, website_admin_url').eq('id', session.clientId).maybeSingle()
  const adminUrl = (clientRow?.website_admin_url ?? '').trim()

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

      {adminUrl && (
        <div className="card-base flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900">Beheeromgeving van uw website</h2>
            <p className="text-sm text-gray-500">Hier past u zelf de inhoud van uw website aan.</p>
          </div>
          <a href={adminUrl} target="_blank" rel="noreferrer" className="btn-primary text-sm">
            Openen<ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}

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
