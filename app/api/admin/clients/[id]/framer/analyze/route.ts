import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { logAudit, requestMeta } from '@/lib/audit'
import { framerConfigured, listCollectionsWithSchema, getCollectionItems } from '@/lib/framer-cms'
import { mirrorSyncedItems } from '@/lib/cms-mirror'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — verbind met Framer, haal collecties + velden + items 1-op-1 op en
// spiegel ze in cms_collections/cms_items. Bestaande koppelingen (client_editable)
// blijven behouden.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin
      .from('clients').select('id, company_name, framer_project_url, framer_api_key').eq('id', id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    if (!framerConfigured(client)) return NextResponse.json({ error: 'Framer-project + API-key eerst instellen' }, { status: 400 })

    const projectUrl = client.framer_project_url as string
    const apiKey = client.framer_api_key as string

    const collections = await listCollectionsWithSchema(projectUrl, apiKey)

    // Bestaande client_editable-instellingen bewaren.
    const { data: existing } = await admin
      .from('cms_collections').select('framer_collection_id, client_editable').eq('client_id', id)
    const editableMap = new Map((existing ?? []).map((r) => [r.framer_collection_id, r.client_editable]))

    const summary = { collections: collections.length, items: 0, editableCollections: 0 }

    for (const col of collections) {
      const items = col.editable ? await getCollectionItems(projectUrl, apiKey, col.id) : []
      // Standaard: enkel door de klant gemaakte (bewerkbare) collecties zijn
      // client_editable; behoud een eerder gemaakte keuze.
      const clientEditable = editableMap.has(col.id) ? !!editableMap.get(col.id) : col.editable

      const { data: colRow, error: colErr } = await admin
        .from('cms_collections')
        .upsert({
          client_id: id,
          framer_collection_id: col.id,
          name: col.name,
          slug: col.slugField,
          fields: col.fields,
          client_editable: clientEditable,
          item_count: items.length,
          synced_at: new Date().toISOString(),
        }, { onConflict: 'client_id,framer_collection_id' })
        .select('id')
        .single()
      if (colErr || !colRow) continue
      if (clientEditable) summary.editableCollections++

      // Items spiegelen (manueel update-of-insert op framer_item_id — zie cms-mirror).
      // Lokale 'new'/'dirty'/'deleted'-items blijven met rust.
      if (col.editable && items.length > 0) {
        await mirrorSyncedItems(admin, colRow.id, items)
        summary.items += items.length
      }
    }

    const meta = requestMeta(req)
    await logAudit({
      action: 'client.framer.analyze', entityType: 'client', entityId: id,
      summary: `Framer-CMS geïmporteerd voor ${client.company_name}: ${summary.collections} collectie(s), ${summary.items} item(s)`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      metadata: { ...summary }, ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, summary, collections: collections.map((c) => ({ id: c.id, name: c.name, editable: c.editable, managedBy: c.managedBy, fieldCount: c.fields.length })) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
