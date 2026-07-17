import { NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { requirePortalPermission } from '@/lib/portal-auth'
import { framerConfigured, listCollectionsWithSchema, getCollectionItems } from '@/lib/framer-cms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — haalt de HUIDIGE collecties + items uit Framer op en werkt de werkkopie
// bij, zodat de klant altijd de actuele website-content ziet. Lokale wijzigingen
// (new/dirty/deleted) blijven behouden; enkel 'synced'-rijen worden ververst.
export async function POST() {
  const g = await requirePortalPermission('cms', 'edit')
  if (!g.ok) return g.response
  try {
    const admin = createAdminSupabaseClient()
    const { data: client } = await admin
      .from('clients').select('id, cms_enabled, framer_project_url, framer_api_key').eq('id', g.session.clientId).maybeSingle()
    if (!client?.cms_enabled) return NextResponse.json({ error: 'CMS niet ingeschakeld' }, { status: 400 })
    if (!framerConfigured(client)) return NextResponse.json({ error: 'Framer niet geconfigureerd' }, { status: 400 })

    const projectUrl = client.framer_project_url as string
    const apiKey = client.framer_api_key as string

    // Enkel de door de klant bewerkbare collecties.
    const { data: editableCols } = await admin
      .from('cms_collections').select('id, framer_collection_id').eq('client_id', g.session.clientId).eq('client_editable', true)
    const editableIds = new Set((editableCols ?? []).map((c) => c.framer_collection_id))
    if (editableIds.size === 0) return NextResponse.json({ ok: true, synced: 0 })

    const collections = await listCollectionsWithSchema(projectUrl, apiKey)
    let syncedItems = 0

    for (const col of collections) {
      if (!editableIds.has(col.id)) continue
      const { data: colRow } = await admin
        .from('cms_collections')
        .select('id')
        .eq('client_id', g.session.clientId)
        .eq('framer_collection_id', col.id)
        .maybeSingle()
      if (!colRow) continue

      // Velden + item-aantal bijwerken.
      const items = await getCollectionItems(projectUrl, apiKey, col.id)
      await admin.from('cms_collections').update({ fields: col.fields, item_count: items.length, synced_at: new Date().toISOString() }).eq('id', colRow.id)

      // Bestaande 'synced'-rijen ophalen om verdwenen items op te ruimen.
      const { data: current } = await admin
        .from('cms_items').select('id, framer_item_id, status').eq('collection_id', colRow.id)
      const liveIds = new Set(items.map((it) => it.framerItemId))
      // Synced-rijen die niet meer in Framer bestaan → verwijderen.
      const gone = (current ?? []).filter((r) => r.status === 'synced' && r.framer_item_id && !liveIds.has(r.framer_item_id))
      if (gone.length) await admin.from('cms_items').delete().in('id', gone.map((r) => r.id))

      // Live items upserten (enkel synced-rijen worden overschreven; new/dirty/deleted blijven).
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const existing = (current ?? []).find((r) => r.framer_item_id === it.framerItemId)
        if (existing && existing.status !== 'synced') continue // lokale wijziging behouden
        await admin.from('cms_items').upsert({
          collection_id: colRow.id,
          framer_item_id: it.framerItemId,
          slug: it.slug,
          field_data: it.values,
          status: 'synced',
          position: i,
        }, { onConflict: 'collection_id,framer_item_id' })
        syncedItems++
      }
    }

    return NextResponse.json({ ok: true, synced: syncedItems })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
