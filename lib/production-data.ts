import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { loadActiveSocialLifecycles } from '@/lib/lifecycle-data'
import { isReviewMonth } from '@/lib/lifecycle'
import { isProductionMonth, shootMonth, type Batch } from '@/lib/production'
import type { ClientLifecycle } from '@/lib/lifecycle'

export type ProductionClient = ClientLifecycle & { batchId: string | null }

export type ProductionData = {
  batches: Batch[]
  clients: ProductionClient[]
  migrated: boolean  // false = batches/kolom bestaan nog niet
}

/** Laadt batches + actieve social-klanten met hun batch-koppeling. Degradeert vóór migratie. */
export async function loadProduction(now = new Date()): Promise<ProductionData> {
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

  // batch_id per klant (kan ontbreken vóór migratie)
  const batchByClient = new Map<string, string | null>()
  if (migrated) {
    try {
      const { data } = await admin.from('clients').select('id, batch_id').is('archived_at', null)
      for (const c of (data ?? []) as { id: string; batch_id: string | null }[]) batchByClient.set(c.id, c.batch_id)
    } catch { /* kolom ontbreekt */ }
  }

  const lifecycles = await loadActiveSocialLifecycles(now)
  const clients: ProductionClient[] = lifecycles.map((l) => ({ ...l, batchId: batchByClient.get(l.clientId) ?? null }))

  return { batches, clients, migrated }
}

/** Default-batch voor een klant afgeleid uit de contractstart (ankermaand). */
export function defaultBatchFor(client: ProductionClient, batches: Batch[]): Batch | null {
  if (client.batchId) return batches.find((b) => b.id === client.batchId) ?? null
  if (client.batchMonth == null) return null
  // kies batch met overeenkomende contentstart
  return batches.find((b) => b.start_month === client.batchMonth) ?? null
}

export type ClientStage = 'scripts' | 'shoot' | 'montage' | 'review' | 'live' | 'idle'

/** Wat moet er deze maand voor deze klant gebeuren (afgeleid uit batch + review-cyclus)? */
export function clientStages(client: ProductionClient, batches: Batch[], year: number, month: number): ClientStage[] {
  const stages: ClientStage[] = []
  const b = defaultBatchFor(client, batches)
  if (b && isProductionMonth(b, month)) {
    stages.push('scripts', 'shoot', 'montage')
  }
  if (isReviewMonth(client.startDate, year, month)) stages.push('review')
  if (stages.length === 0) stages.push('live')
  return stages
}
