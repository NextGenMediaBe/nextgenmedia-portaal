import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { logAudit, requestMeta } from '@/lib/audit'
import { framerConfigured } from '@/lib/framer-cms'

export const dynamic = 'force-dynamic'

// GET — koppelstatus + reeds geïmporteerde collecties (API-key NOOIT teruggeven).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin
      .from('clients').select('id, framer_project_url, framer_api_key, cms_enabled').eq('id', id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    let collections: unknown[] = []
    try {
      const { data } = await admin
        .from('cms_collections')
        .select('id, framer_collection_id, name, slug, fields, client_editable, item_count, synced_at')
        .eq('client_id', id)
        .order('name', { ascending: true })
      collections = data ?? []
    } catch { /* tabel mogelijk nog niet gemigreerd */ }

    return NextResponse.json({
      projectUrl: client.framer_project_url ?? '',
      hasApiKey: !!client.framer_api_key,        // enkel of er een key is, nooit de key zelf
      cmsEnabled: !!client.cms_enabled,
      configured: framerConfigured(client),
      collections,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST — koppeling opslaan. body: { projectUrl, apiKey?, cmsEnabled }
// apiKey leeg = bestaande key behouden (zodat we 'm niet hoeven terug te tonen).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const { projectUrl, apiKey, cmsEnabled } = await req.json()
    const admin = createAdminSupabaseClient()

    const { data: client } = await admin.from('clients').select('id, company_name').eq('id', id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    const patch: Record<string, unknown> = {}
    if (projectUrl !== undefined) patch.framer_project_url = String(projectUrl).trim() || null
    if (typeof apiKey === 'string' && apiKey.trim()) patch.framer_api_key = apiKey.trim()
    if (typeof cmsEnabled === 'boolean') patch.cms_enabled = cmsEnabled
    if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true })

    const { error } = await admin.from('clients').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    const meta = requestMeta(req)
    await logAudit({
      action: 'client.framer.link', entityType: 'client', entityId: id,
      summary: `Framer-CMS-koppeling bijgewerkt voor ${client.company_name}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      metadata: { hasProject: !!patch.framer_project_url, keyUpdated: !!patch.framer_api_key, cmsEnabled: patch.cms_enabled },
      ip: meta.ip, userAgent: meta.userAgent,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
