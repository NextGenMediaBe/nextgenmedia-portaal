import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import {
  validateFramerConfig, testFramerConnection, listFramerCollections, listFramerFields, suggestFieldMap,
  logFramerAction, type FramerClientConfig,
} from '@/lib/framer'

type ClientRow = {
  id: string; company_name: string; framer_project_url: string | null; framer_api_key: string | null
  framer_blog_collection_id: string | null; framer_field_map: unknown; framer_last_sync: string | null
}

function configOf(c: ClientRow): FramerClientConfig {
  return {
    projectUrl: c.framer_project_url, apiKeyEncrypted: c.framer_api_key,
    collectionId: c.framer_blog_collection_id, fieldMap: (c.framer_field_map ?? null) as Record<string, string> | null,
  }
}

// GET — overzicht per klant (blogs_inbegrepen) + dashboardstats
export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)

    const [{ data: clients }, { data: blogs }, { data: logs }] = await Promise.all([
      admin.from('clients').select('id, company_name, framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map, framer_last_sync').eq('blogs_inbegrepen', true).is('archived_at', null).order('company_name'),
      admin.from('blogs').select('client_id, status'),
      admin.from('framer_logs').select('client_id, actie, status, created_at').gte('created_at', startToday.toISOString()),
    ])

    const blogRows = (blogs ?? []) as { client_id: string; status: string }[]
    const countBy = (cid: string, st: string) => blogRows.filter((b) => b.client_id === cid && b.status === st).length

    const rows = ((clients ?? []) as ClientRow[]).map((c) => {
      const valid = validateFramerConfig(configOf(c)).ok
      const failed = countBy(c.id, 'gefaald')
      const state = failed > 0 ? 'rood' : valid ? 'groen' : 'oranje'
      return {
        id: c.id, company_name: c.company_name,
        connected: !!(c.framer_project_url && c.framer_api_key),
        project_url: c.framer_project_url,
        collection_linked: !!c.framer_blog_collection_id,
        framer_valid: valid,
        last_sync: c.framer_last_sync,
        published: countBy(c.id, 'gepubliceerd'),
        review: countBy(c.id, 'klaar_voor_review'),
        approved: countBy(c.id, 'goedgekeurd'),
        failed,
        state,
      }
    })

    const publishedToday = (logs ?? []).filter((l: { actie: string; status: string }) => l.actie === 'publish' && l.status === 'ok').length
    const failedToday = (logs ?? []).filter((l: { actie: string; status: string }) => l.status === 'gefaald').length
    const stats = {
      linkedProjects: rows.filter((r) => r.framer_valid).length,
      activeProjects: rows.filter((r) => r.connected).length,
      publishedToday,
      failedTotal: rows.reduce((s, r) => s + r.failed, 0),
      failedToday,
      readyToPublish: rows.reduce((s, r) => s + r.review + r.approved, 0),
    }

    return NextResponse.json({ rows, stats })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST { action, client_id, collection_id? }
export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.client_id) return NextResponse.json({ error: 'client_id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: c } = await admin.from('clients').select('id, company_name, framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map, framer_last_sync').eq('id', b.client_id).maybeSingle()
    if (!c) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    const config = configOf(c as ClientRow)

    if (b.action === 'test') {
      const r = await testFramerConnection(config)
      await logFramerAction(b.client_id, null, 'test', r.ok ? 'ok' : 'gefaald', r.ok ? null : r.error)
      return NextResponse.json(r)
    }
    if (b.action === 'collections') {
      const r = await listFramerCollections(config)
      await logFramerAction(b.client_id, null, 'connect', r.ok ? 'ok' : 'gefaald', r.ok ? null : r.error)
      return NextResponse.json(r)
    }
    if (b.action === 'fields') {
      const collId = b.collection_id || c.framer_blog_collection_id
      if (!collId) return NextResponse.json({ error: 'Geen collectie geselecteerd' }, { status: 400 })
      const r = await listFramerFields(config, collId)
      if (r.ok && r.fields) return NextResponse.json({ ok: true, fields: r.fields, suggested: suggestFieldMap(r.fields) })
      return NextResponse.json(r)
    }
    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
