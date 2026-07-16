import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { requirePortalPermission, logPortalAction } from '@/lib/portal-auth'
import { framerConfigured, pushItems, removeItems, publishSite, type FramerField, type PushItem } from '@/lib/framer-cms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST — publiceer de werkkopie naar de Framer-website: nieuwe/gewijzigde items
// terugschrijven, verwijderde items schrappen, daarna publiceren + deployen.
export async function POST(req: NextRequest) {
  const g = await requirePortalPermission('cms', 'publish')
  if (!g.ok) return g.response
  try {
    const admin = createAdminSupabaseClient()
    const { data: client } = await admin
      .from('clients').select('id, cms_enabled, framer_project_url, framer_api_key').eq('id', g.session.clientId).maybeSingle()
    if (!client?.cms_enabled) return NextResponse.json({ error: 'CMS niet ingeschakeld' }, { status: 400 })
    if (!framerConfigured(client)) return NextResponse.json({ error: 'Framer niet geconfigureerd' }, { status: 400 })

    const projectUrl = client.framer_project_url as string
    const apiKey = client.framer_api_key as string

    const { data: cols } = await admin
      .from('cms_collections')
      .select('id, framer_collection_id, fields')
      .eq('client_id', g.session.clientId)
      .eq('client_editable', true)
    const collections = cols ?? []

    const summary = { pushed: 0, deleted: 0, collections: 0 }

    for (const col of collections) {
      const { data: rows } = await admin
        .from('cms_items')
        .select('id, framer_item_id, slug, field_data, status')
        .eq('collection_id', col.id)
        .in('status', ['new', 'dirty', 'deleted'])
      const dirty = rows ?? []
      if (dirty.length === 0) continue
      summary.collections++

      const fields = (Array.isArray(col.fields) ? col.fields : []) as FramerField[]

      // 1) Verwijderde items schrappen in Framer.
      const toDelete = dirty.filter((r) => r.status === 'deleted' && r.framer_item_id)
      if (toDelete.length) {
        await removeItems(projectUrl, apiKey, toDelete.map((r) => r.framer_item_id as string))
        await admin.from('cms_items').delete().in('id', toDelete.map((r) => r.id))
        summary.deleted += toDelete.length
      }
      // Nieuwe items die lokaal als 'deleted' gemarkeerd zijn (nooit gepusht) → gewoon lokaal weg.
      const localDelete = dirty.filter((r) => r.status === 'deleted' && !r.framer_item_id)
      if (localDelete.length) await admin.from('cms_items').delete().in('id', localDelete.map((r) => r.id))

      // 2) Nieuwe + gewijzigde items terugschrijven.
      const toPush = dirty.filter((r) => r.status === 'new' || r.status === 'dirty')
      if (toPush.length) {
        const items: PushItem[] = toPush.map((r, i) => ({
          framerItemId: r.framer_item_id,
          slug: r.slug || `item-${Date.now()}-${i}`,
          values: (r.field_data && typeof r.field_data === 'object') ? (r.field_data as Record<string, string>) : {},
        }))
        const newIds = await pushItems(projectUrl, apiKey, col.framer_collection_id, fields, items)
        // Nieuw aangemaakte items: bewaar het Framer-item-id + markeer synced.
        for (const r of toPush) {
          const patch: Record<string, unknown> = { status: 'synced' }
          if (!r.framer_item_id) {
            const nid = newIds[r.slug || '']
            if (nid) patch.framer_item_id = nid
          }
          await admin.from('cms_items').update(patch).eq('id', r.id)
        }
        summary.pushed += toPush.length
      }
    }

    // 3) Publiceren + live zetten.
    await publishSite(projectUrl, apiKey)

    await logPortalAction(g.session, 'cms.publish', { type: 'client', id: g.session.clientId }, { req, meta: summary })
    return NextResponse.json({ ok: true, summary })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
