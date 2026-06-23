export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { ContractsClient } from './contracts-client'

async function getContracts() {
  const admin = createAdminSupabaseClient()

  // select('*') zodat ontbrekende kolommen (template_id vóór migratie) nooit breken.
  const [{ data: contracts }, { data: clients }, { data: templates }] = await Promise.all([
    admin
      .from('contracts')
      .select('*')
      .order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').order('company_name'),
    admin.from('contract_templates').select('id, name').order('name'),
  ])

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]))

  const enriched = (contracts ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    status: c.status,
    service_slug: c.service_slug ?? null,
    signed_at: c.signed_at ?? null,
    sent_at: c.sent_at ?? null,
    created_at: c.created_at,
    expires_at: c.expires_at ?? null,
    access_token: c.access_token,
    client_id: c.client_id ?? null,
    template_id: c.template_id ?? null,
    signer_name: c.signer_name ?? null,
    signer_email: c.signer_email ?? null,
    client: clientMap.get(c.client_id) ?? null,
  }))

  return { contracts: enriched, clients: clients ?? [], templates: templates ?? [] }
}

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { contracts, clients, templates } = await getContracts()
  const sp = await searchParams
  const initialStatus = typeof sp?.status === 'string' ? sp.status : 'all'

  return (
    <ContractsClient
      initialStatus={initialStatus}
      initialContracts={contracts as Array<{
        id: string
        title: string
        status: string
        service_slug: string | null
        signed_at: string | null
        sent_at: string | null
        created_at: string
        expires_at: string | null
        access_token: string
        client_id: string | null
        template_id: string | null
        signer_name: string | null
        signer_email: string | null
        client: { id: string; company_name: string } | null
      }>}
      clients={clients as Array<{ id: string; company_name: string }>}
      templates={templates as Array<{ id: string; name: string }>}
    />
  )
}
