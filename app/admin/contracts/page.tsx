export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { ContractsClient } from './contracts-client'

async function getContracts() {
  const admin = createAdminSupabaseClient()

  // Two separate queries — no FK join (avoids PostgREST constraint requirement)
  const [{ data: contracts }, { data: clients }] = await Promise.all([
    admin
      .from('contracts')
      .select('id, title, status, service_slug, signed_at, sent_at, created_at, access_token, client_id')
      .order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').order('company_name'),
  ])

  const clientMap = new Map((clients ?? []).map((c) => [c.id, c]))

  const enriched = (contracts ?? []).map((c) => ({
    ...c,
    client: clientMap.get(c.client_id) ?? null,
  }))

  return { contracts: enriched, clients: clients ?? [] }
}

export default async function ContractsPage() {
  const { contracts, clients } = await getContracts()

  return (
    <ContractsClient
      initialContracts={contracts as Array<{
        id: string
        title: string
        status: string
        service_slug: string | null
        signed_at: string | null
        sent_at: string | null
        created_at: string
        access_token: string
        client_id: string | null
        client: { id: string; company_name: string } | null
      }>}
      clients={clients as Array<{ id: string; company_name: string }>}
    />
  )
}
