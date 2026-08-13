export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { SalesCalendar } from './calendar'

// Appointment setting — de kalender van één belklant (§5).
export default async function SalesAppointmentsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('sales_clients')
    .select('id, name, timezone, slot_interval_min, default_duration_min')
    .neq('status', 'archived')
    .order('name')
  const clients = data ?? []

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Appointment setting</h1>
        <p className="text-sm text-gray-500 mt-0.5">Sleep op een vrij (wit) moment om een afspraak te boeken in de agenda van de klant.</p>
      </div>

      {clients.length === 0 ? (
        <div className="card-base text-sm text-gray-600">
          Nog geen klanten. Maak er eerst één aan via <b>Pipeline → Nieuwe klant</b>.
        </div>
      ) : (
        <SalesCalendar
          clients={clients}
          initialClientId={sp.client && clients.some((c) => c.id === sp.client) ? sp.client : clients[0].id}
          initialLeadId={sp.lead}
        />
      )}
    </div>
  )
}
