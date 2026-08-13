export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { PipelineClient } from './pipeline-client'

// Pipeline — leads per belklant (§4).
export default async function SalesPipelinePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('sales_clients').select('id, name').neq('status', 'archived').order('name')
  const clients = data ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Pipeline</h1>
        <p className="text-sm text-gray-500 mt-0.5">Prospects per klant. Interesse? Boek de afspraak via de knop bij de lead.</p>
      </div>
      <PipelineClient
        clients={clients}
        initialClientId={sp.client && clients.some((c) => c.id === sp.client) ? sp.client : (clients[0]?.id ?? '')}
      />
    </div>
  )
}
