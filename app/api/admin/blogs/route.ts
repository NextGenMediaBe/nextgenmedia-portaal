import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateBlogsForClient, sendBlogReviewMail } from '@/lib/blog-generate'
import { generateBlog, slugify } from '@/lib/blog-ai'
import { publishBlogToFramer, type FramerClientConfig } from '@/lib/framer'

const CLIENT_BLOG_COLS = 'id, company_name, website_url, niche, blog_brand_context, blog_aantal_per_cyclus, blog_frequentie_maanden, blog_volgende_generatie_datum'

// GET ?client_id=&status= — blogs ophalen (admin)
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const sp = req.nextUrl.searchParams
    const admin = createAdminSupabaseClient()
    let q = admin.from('blogs').select('*').order('gegenereerd_op', { ascending: false })
    if (sp.get('client_id')) q = q.eq('client_id', sp.get('client_id'))
    if (sp.get('status')) q = q.eq('status', sp.get('status'))
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return NextResponse.json({ blogs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST { action:'generate', client_id, count? } — manueel genereren
export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (b.action !== 'generate' || !b.client_id) return NextResponse.json({ error: 'Ongeldige actie' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: client } = await admin.from('clients').select(CLIENT_BLOG_COLS).eq('id', b.client_id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    const count = Math.max(1, Number(b.count) || client.blog_aantal_per_cyclus || 1)
    const created = await generateBlogsForClient(client, count)
    await sendBlogReviewMail(client, created)
    try { revalidatePath('/admin/blogs'); revalidatePath(`/admin/clients/${b.client_id}`) } catch { }
    return NextResponse.json({ created: created.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { id, action?, ...fields }
//   action 'save'      → velden bewerken (titel/slug/content/meta/thumbnail)
//   action 'regenerate'→ inhoud opnieuw genereren
//   action 'approve'   → valideren + publiceren naar Framer
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 400 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: blog } = await admin.from('blogs').select('*').eq('id', b.id).maybeSingle()
    if (!blog) return NextResponse.json({ error: 'Blog niet gevonden' }, { status: 404 })

    // ── Opnieuw genereren ──────────────────────────────────────────────────
    if (b.action === 'regenerate') {
      const { data: client } = await admin.from('clients').select(CLIENT_BLOG_COLS).eq('id', blog.client_id).maybeSingle()
      const g = await generateBlog({
        clientName: client?.company_name ?? 'Klant', website: client?.website_url, niche: client?.niche,
        brandContext: client?.blog_brand_context, recentTitles: [blog.titel],
      })
      const { error } = await admin.from('blogs').update({
        titel: g.titel, content: g.content, meta_title: g.meta_title, meta_description: g.meta_description,
        status: 'klaar_voor_review', foutmelding: null,
      }).eq('id', b.id)
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/blogs') } catch { }
      return NextResponse.json({ ok: true })
    }

    // ── Goedkeuren → publiceren ─────────────────────────────────────────────
    if (b.action === 'approve') {
      const { data: client } = await admin.from('clients').select('framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map').eq('id', blog.client_id).maybeSingle()
      const config: FramerClientConfig = {
        projectUrl: client?.framer_project_url ?? null,
        apiKeyEncrypted: client?.framer_api_key ?? null,
        collectionId: client?.framer_blog_collection_id ?? null,
        fieldMap: (client?.framer_field_map ?? null) as Record<string, string> | null,
      }
      const result = await publishBlogToFramer(config, {
        id: blog.id, titel: blog.titel, slug: blog.slug, content: blog.content,
        meta_title: blog.meta_title, meta_description: blog.meta_description, thumbnail_url: blog.thumbnail_url,
        framer_item_id: blog.framer_item_id,
      }, { confirmOverride: !!b.confirm_override })

      const nowIso = new Date().toISOString()
      const patch: Record<string, unknown> = { status: 'goedgekeurd', goedgekeurd_op: blog.goedgekeurd_op ?? nowIso }
      if (result.ok) {
        patch.status = 'gepubliceerd'; patch.gepubliceerd_op = nowIso; patch.foutmelding = null
        if (result.framerItemId) patch.framer_item_id = result.framerItemId
      } else if (result.pending) {
        patch.foutmelding = result.error ?? null // info: integratie nog te activeren
      } else {
        patch.status = 'gefaald'; patch.foutmelding = result.error ?? 'Publicatie mislukt'
      }
      const { error } = await admin.from('blogs').update(patch).eq('id', b.id)
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/blogs') } catch { }
      return NextResponse.json({ ok: true, published: result.ok, pending: !!result.pending, warning: result.warning ?? null, error: result.ok ? null : result.error })
    }

    // ── Velden bewerken / opslaan ───────────────────────────────────────────
    const patch: Record<string, unknown> = {}
    if (b.titel !== undefined) { patch.titel = String(b.titel); if (b.slug === undefined && b.relock_slug) patch.slug = slugify(String(b.titel)) }
    if (b.slug !== undefined) patch.slug = slugify(String(b.slug))
    if (b.content !== undefined) patch.content = b.content
    if (b.meta_title !== undefined) patch.meta_title = b.meta_title
    if (b.meta_description !== undefined) patch.meta_description = b.meta_description
    if (b.thumbnail_url !== undefined) patch.thumbnail_url = b.thumbnail_url || null
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    const { error } = await admin.from('blogs').update(patch).eq('id', b.id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/blogs') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE ?id= — blog (draft) verwijderen / afkeuren
export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('blogs').delete().eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/blogs') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
