import { createAdminSupabaseClient } from '@/lib/supabase/server'
import type { Batch } from '@/lib/production'
import { BatchManager } from './batch-manager'

// Batchbeheer (kleur + indeling) — geïntegreerd in de maandplanning sinds de
// aparte Productie-tab verdween. Degradeert vóór de migratie.
export async function BatchSection() {
  const admin = createAdminSupabaseClient()

  let batches: Batch[] = []
  let migrated = true
  try {
    const { data, error } = await admin.from('batches').select('*').order('sort_order', { ascending: true })
    if (error) throw error
    batches = (data ?? []) as Batch[]
  } catch {
    migrated = false
  }

  let clients: { id: string; name: string; batchId: string | null; batchMonth: number | null }[] = []
  if (migrated) {
    try {
      const { data } = await admin.from('clients').select('id, company_name, batch_id').is('archived_at', null).order('company_name')
      clients = ((data ?? []) as { id: string; company_name: string; batch_id: string | null }[]).map((c) => ({
        id: c.id, name: c.company_name, batchId: c.batch_id, batchMonth: null,
      }))
    } catch { /* kolom ontbreekt */ }
  }

  if (!migrated) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Batchbeheer beschikbaar zodra <code className="rounded bg-amber-100 px-1">99999999_SYNC_ALL.sql</code> in Supabase is uitgevoerd.
      </div>
    )
  }

  return <BatchManager batches={batches} clients={clients} />
}
