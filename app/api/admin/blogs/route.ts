import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { generateBlogsForAccount, sendBlogReviewMail, type BlogAccount } from '@/lib/blog-generate'
import { generateBlog, slugify } from '@/lib/blog-ai'
import { publishBlogToFramer, markFramerSync, type FramerClientConfig } from '@/lib/framer'

const ACCOUNT_COLS = 'id, name, website_url, briefing, aantal_per_cyclus, frequentie_maanden, volgende_generatie_datum, client_id'
const FRAMER_COLS = 'framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map, max_live_blogs'

// GET ?account_id= | ?client_id= | ?status=
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const sp = req.nextUrl.searchParams
    const admin = createAdminSupabaseClient()
    let q = admin.from('blogs').select('*').order('gegenereerd_op', { ascending: false })
    if (sp.get('account_id')) q = q.eq('account_id', sp.get('account_id'))
    if (sp.get('client_id')) q = q.eq('client_id', sp.get('client_id'))
    if (sp.get('status')) q = q.eq('status', sp.get('status'))
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return NextResponse.json({ blogs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST { action:'generate', account_id, count? }
export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (b.action !== 'generate' || !b.account_id) return NextResponse.json({ error: 'Ongeldige actie' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: account } = await admin.from('blog_accounts').select(ACCOUNT_COLS).eq('id', b.account_id).maybeSingle()
    if (!account) return NextResponse.json({ error: 'Blogaccount niet gevonden' }, { status: 404 })
    const count = Math.max(1, Number(b.count) || (account as BlogAccount).aantal_per_cyclus || 1)
    const created = await generateBlogsForAccount(account as BlogAccount, count)
    await sendBlogReviewMail(account as BlogAccount, created)
    try { revalidatePath('/admin/blogs') } catch { }
    return NextResponse.json({ created: created.length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { id, action?, ...fields }
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 400 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: blog } = await admin.from('blogs').select('*').eq('id', b.id).maybeSingle()
    if (!blog) return NextResponse.json({ error: 'Blog niet gevonden' }, { status: 404 })

    if (b.action === 'regenerate') {
      const { data: account } = await admin.from('blog_accounts').select(ACCOUNT_COLS).eq('id', blog.account_id).maybeSingle()
      const g = await generateBlog({ clientName: account?.name ?? 'Blog', website: account?.website_url, brandContext: account?.briefing, recentTitles: [blog.titel] })
      const { error } = await admin.from('blogs').update({ titel: g.titel, content: g.content, meta_title: g.meta_title, meta_description: g.meta_description, status: 'klaar_voor_review', foutmelding: null }).eq('id', b.id)
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/blogs') } catch { }
      return NextResponse.json({ ok: true })
    }

    if (b.action === 'approve') {
      const { data: account } = await admin.from('blog_accounts').select(`id, ${FRAMER_COLS}`).eq('id', blog.account_id).maybeSingle()
      const config: FramerClientConfig = {
        projectUrl: account?.framer_project_url ?? null, apiKeyEncrypted: account?.framer_api_key ?? null,
        collectionId: account?.framer_blog_collection_id ?? null, fieldMap: (account?.framer_field_map ?? null) as Record<string, string> | null,
      }
      const { count: prevPublished } = await admin.from('blogs').select('id', { count: 'exact', head: true }).eq('account_id', blog.account_id).eq('status', 'gepubliceerd')
      const firstPublish = (prevPublished ?? 0) === 0

      const result = await publishBlogToFramer(config, {
        id: blog.id, titel: blog.titel, slug: blog.slug, content: blog.content,
        meta_title: blog.meta_title, meta_description: blog.meta_description, thumbnail_url: blog.thumbnail_url, framer_item_id: blog.framer_item_id,
      }, { confirmOverride: !!b.confirm_override, accountId: blog.account_id })

      if (result.needsConfirm) return NextResponse.json({ ok: true, needsConfirm: true, warning: result.warning ?? null })

      const nowIso = new Date().toISOString()
      const patch: Record<string, unknown> = { status: 'goedgekeurd', goedgekeurd_op: blog.goedgekeurd_op ?? nowIso }
      if (result.ok) { patch.status = 'gepubliceerd'; patch.gepubliceerd_op = nowIso; patch.foutmelding = null; if (result.framerItemId) patch.framer_item_id = result.framerItemId }
      else if (result.pending) patch.foutmelding = result.error ?? null
      else { patch.status = 'gefaald'; patch.foutmelding = result.error ?? 'Publicatie mislukt' }
      const { error } = await admin.from('blogs').update(patch).eq('id', b.id)
      if (error) throw new Error(error.message)

      let maxLiveTrimmed = 0
      if (result.ok) {
        await markFramerSync(blog.account_id)
        // Maximum aantal live blogs afdwingen: oudste extra's terug op 'goedgekeurd'.
        const max = Number(account?.max_live_blogs) || 0
        if (max > 0) {
          const { data: live } = await admin.from('blogs').select('id, gepubliceerd_op').eq('account_id', blog.account_id).eq('status', 'gepubliceerd').order('gepubliceerd_op', { ascending: true })
          const over = (live ?? []).slice(0, Math.max(0, (live ?? []).length - max))
          if (over.length > 0) {
            await admin.from('blogs').update({ status: 'goedgekeurd', foutmelding: 'Op draft gezet — maximum live blogs bereikt.' }).in('id', over.map((o: { id: string }) => o.id))
            maxLiveTrimmed = over.length
          }
        }
      }
      try { revalidatePath('/admin/blogs') } catch { }
      return NextResponse.json({ ok: true, published: result.ok, pending: !!result.pending, firstPublish, maxLiveTrimmed, error: result.ok ? null : result.error })
    }

    // Velden bewerken
    const patch: Record<string, unknown> = {}
    if (b.titel !== undefined) patch.titel = String(b.titel)
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
