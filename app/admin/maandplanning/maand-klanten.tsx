import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { loadActiveSocialLifecycles } from '@/lib/lifecycle-data'
import type { ClientLifecycle } from '@/lib/lifecycle'
import { MonthClientPhases, type ClientOpt } from './month-client-phases'

function contractStatus(lc?: ClientLifecycle): string {
  if (!lc || lc.daysUntilEnd == null) return 'Actief'
  if (lc.daysUntilEnd < 0) return 'Verlopen'
  if (lc.daysUntilEnd <= 30) return `Loopt af (${lc.daysUntilEnd}d)`
  if (lc.daysUntilEnd <= 60) return `Verlenging nodig (${lc.daysUntilEnd}d)`
  return 'Actief'
}
function nextAction(lc?: ClientLifecycle): string {
  if (!lc) return 'Onboarding'
  if (lc.reviewThisMonth) return 'Strategie review'
  if (lc.daysUntilEnd != null && lc.daysUntilEnd <= 60) return 'Contractverlenging'
  return 'Content cyclus'
}

export async function MaandKlanten() {
  const admin = createAdminSupabaseClient()

  // Batchkleuren (degradeert als de tabel nog niet bestaat)
  const batchColor = new Map<string, string>()
  try {
    const { data } = await admin.from('batches').select('id, color')
    for (const b of (data ?? []) as { id: string; color: string }[]) batchColor.set(b.id, b.color)
  } catch { /* geen batches */ }

  // Alle actieve klanten + (optioneel) batch_id
  let clientRows: { id: string; company_name: string; batch_id: string | null }[] = []
  try {
    const { data } = await admin.from('clients').select('id, company_name, batch_id').is('archived_at', null).order('company_name')
    clientRows = (data ?? []) as typeof clientRows
  } catch {
    const { data } = await admin.from('clients').select('id, company_name').is('archived_at', null).order('company_name')
    clientRows = ((data ?? []) as { id: string; company_name: string }[]).map((c) => ({ ...c, batch_id: null }))
  }

  const lcById = new Map((await loadActiveSocialLifecycles()).map((l) => [l.clientId, l]))

  const clients: ClientOpt[] = clientRows.map((c) => {
    const lc = lcById.get(c.id)
    return {
      id: c.id,
      name: c.company_name,
      batchColor: c.batch_id ? (batchColor.get(c.batch_id) ?? null) : null,
      contractStatus: contractStatus(lc),
      nextAction: nextAction(lc),
    }
  })

  return <MonthClientPhases clients={clients} />
}
