import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import { WebsiteRequestClient } from './website-request-client'

export default async function PortalWebsitePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase
    .from('clients').select('id, company_name').eq('owner_user_id', user.id).maybeSingle()
  if (!client) redirect('/portal')

  // Check webdesign service
  const { data: service } = await supabase
    .from('client_services')
    .select('active, config')
    .eq('client_id', client.id)
    .eq('service_slug', 'webdesign')
    .maybeSingle()

  const { data: requests } = await supabase
    .from('webdesign_change_requests')
    .select('id, title, description, kind, status, created_at')
    .eq('client_id', client.id)
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
        clientId={client.id}
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
