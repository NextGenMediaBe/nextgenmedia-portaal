import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { logAudit, requestMeta } from '@/lib/audit'
import {
  clickupConfigured,
  findOrCreateClientList,
  fetchListTasks,
  findTaskByNameAndDate,
  createTask,
  updateTask,
  buildTaskTitle,
  channelOptionId,
  captionOptionId,
  statusFor,
  plannedDateMs,
  syncHash,
  type CuTask,
} from '@/lib/clickup'

// Sync kan even duren (gethrottelde ClickUp-calls) — ruimere limiet.
export const maxDuration = 60

type ContentItem = {
  id: string
  title: string
  content_type: string
  platform: string | null
  platforms: string[] | null
  caption: string | null
  status: string
  planned_date: string
  clickup_task_id: string | null
  clickup_sync_hash: string | null
}

// GET — status van de sync voor deze klant
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin
      .from('clients')
      .select('id, clickup_sync_enabled, clickup_list_id')
      .eq('id', id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    let syncedCount = 0
    try {
      const { count } = await admin
        .from('social_content_items')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .not('clickup_task_id', 'is', null)
      syncedCount = count ?? 0
    } catch { /* kolom mogelijk nog niet gemigreerd */ }

    return NextResponse.json({
      configured: clickupConfigured(),
      enabled: Boolean(client.clickup_sync_enabled),
      linked: Boolean(client.clickup_list_id),
      syncedCount,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH — sync aan/uit zetten voor deze klant
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const { enabled } = await req.json()
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin.from('clients').select('id, company_name').eq('id', id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    const { error } = await admin
      .from('clients')
      .update({ clickup_sync_enabled: Boolean(enabled) })
      .eq('id', id)
    if (error) throw new Error(error.message)

    const meta = requestMeta(req)
    await logAudit({
      action: 'client.clickup_sync.toggle',
      entityType: 'client',
      entityId: id,
      summary: `ClickUp-sync ${enabled ? 'ingeschakeld' : 'uitgeschakeld'} voor ${client.company_name}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      metadata: { enabled: Boolean(enabled) }, ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, enabled: Boolean(enabled) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST — voer de sync uit (app → ClickUp) voor alle contentitems van deze klant
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!clickupConfigured()) {
      return NextResponse.json({ error: 'CLICKUP_API_KEY is niet ingesteld op de server' }, { status: 400 })
    }

    const { id } = await params
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin
      .from('clients')
      .select('id, company_name, clickup_sync_enabled, clickup_folder_id, clickup_list_id')
      .eq('id', id)
      .maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    if (!client.clickup_sync_enabled) {
      return NextResponse.json({ error: 'ClickUp-sync staat uit voor deze klant' }, { status: 400 })
    }

    // Resolve (of maak) de klant-lijst in ClickUp; sla id's op zodat we niet
    // telkens opnieuw zoeken.
    let listId = client.clickup_list_id as string | null
    if (!listId) {
      const ref = await findOrCreateClientList(client.company_name)
      listId = ref.listId
      try {
        await admin.from('clients')
          .update({ clickup_folder_id: ref.folderId, clickup_list_id: ref.listId })
          .eq('id', id)
      } catch { /* niet fataal */ }
    }

    // Bestaande taken één keer ophalen → index voor adoptie (duplicate prevention)
    let existingTasks: CuTask[] = []
    try { existingTasks = await fetchListTasks(listId) } catch { existingTasks = [] }

    const { data: itemsRaw } = await admin
      .from('social_content_items')
      .select('id, title, content_type, platform, platforms, caption, status, planned_date, clickup_task_id, clickup_sync_hash')
      .eq('client_id', id)
      .order('planned_date', { ascending: true })
    const items = (itemsRaw ?? []) as ContentItem[]

    const summary = { total: items.length, created: 0, updated: 0, skipped: 0, failed: 0 }
    const errors: Array<{ id: string; title: string; error: string }> = []

    // Per item: veilig falen, de rest stopt niet.
    for (const item of items) {
      try {
        const platforms = Array.isArray(item.platforms) && item.platforms.length > 0
          ? item.platforms
          : item.platform ? [item.platform] : []

        const name = buildTaskTitle({ content_type: item.content_type, title: item.title, platforms })
        const captionOpt = captionOptionId(item.caption)
        const channelOpt = channelOptionId(platforms)
        const dateMs = plannedDateMs(item.planned_date)
        const status = statusFor(item.status)
        const hash = syncHash({ name, captionOpt, channelOpt, dateMs, status })
        const fields = { name, status, dateMs, captionOpt, channelOpt }

        let taskId = item.clickup_task_id

        // Onbekend task-id → eerst proberen te adopteren op naam + datum
        if (!taskId) {
          const adopted = findTaskByNameAndDate(existingTasks, name, dateMs)
          if (adopted) taskId = adopted.id
        }

        if (taskId) {
          // Niets gewijzigd én reeds bekend → skip (geen onnodige API-calls)
          if (item.clickup_task_id === taskId && item.clickup_sync_hash === hash) {
            summary.skipped++
            continue
          }
          await updateTask(taskId, fields)
          summary.updated++
        } else {
          taskId = await createTask(listId, fields)
          summary.created++
        }

        // Per item committen → sync is hervatbaar als hij halverwege stopt
        await admin
          .from('social_content_items')
          .update({
            clickup_task_id: taskId,
            clickup_sync_hash: hash,
            clickup_synced_at: new Date().toISOString(),
          })
          .eq('id', item.id)
      } catch (e) {
        summary.failed++
        errors.push({ id: item.id, title: item.title, error: e instanceof Error ? e.message : 'Fout' })
      }
    }

    const meta = requestMeta(req)
    await logAudit({
      action: 'client.clickup_sync.run',
      entityType: 'client',
      entityId: id,
      summary: `ClickUp-sync ${client.company_name}: ${summary.created} nieuw, ${summary.updated} bijgewerkt, ${summary.skipped} ongewijzigd, ${summary.failed} mislukt`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      metadata: { ...summary }, ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, summary, errors: errors.slice(0, 25) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
