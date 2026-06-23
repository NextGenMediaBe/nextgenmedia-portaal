import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { slugify } from '@/lib/blog-ai'
import { publishBlogToFramer, markFramerSync, type FramerClientConfig } from '@/lib/framer'
import { snapshotBlogVersion, describeChanges } from '@/lib/blog-versions'

const FRAMER_COLS = 'id, client_id, framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map'

// PATCH { id, titel?, content?, meta_title?, meta_description? }
// Klant bewerkt een blog van zijn gekoppelde blogaccount. Opslaan = (indien
// gepubliceerd + Framer geconfigureerd) automatisch pushen naar Framer + loggen
// wie de wijziging deed. Klanten kunnen blogs NIET verwijderen of genereren.
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    // Eigendomscheck: blog → blogaccount → klant van deze gebruiker.
    const { data: clients } = await supabase.from('clients').select('id').eq('owner_user_id', user.id)
    const clientIds = (clients ?? []).map((c: { id: string }) => c.id)
    if (clientIds.length === 0) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data: blog } = await admin.from('blogs').select('*').eq('id', b.id).maybeSingle()
    if (!blog) return NextResponse.json({ error: 'Blog niet gevonden' }, { status: 404 })

    const { data: account } = await admin.from('blog_accounts').select(FRAMER_COLS).eq('id', blog.account_id).maybeSingle()
    const ownClient = account?.client_id && clientIds.includes(account.client_id)
    const ownBlog = blog.client_id && clientIds.includes(blog.client_id)
    if (!ownClient && !ownBlog) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const fields: Record<string, unknown> = {}
    if (b.titel !== undefined) fields.titel = String(b.titel)
    if (b.slug !== undefined) fields.slug = slugify(String(b.slug))
    if (b.content !== undefined) fields.content = b.content
    if (b.meta_title !== undefined) fields.meta_title = b.meta_title
    if (b.meta_description !== undefined) fields.meta_description = b.meta_description
    if (b.thumbnail_url !== undefined) fields.thumbnail_url = b.thumbnail_url || null
    if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })

    // Versiegeschiedenis: huidige toestand bewaren vóór de wijziging.
    await snapshotBlogVersion(admin, blog.id, blog, user.email ?? user.id, describeChanges(blog, fields))

    const patch: Record<string, unknown> = {
      ...fields,
      laatst_bewerkt_door: user.email ?? user.id,
      laatst_bewerkt_op: new Date().toISOString(),
    }
    if (blog.status === 'gepubliceerd') patch.sync_status = 'pending'

    const { error } = await admin.from('blogs').update(patch).eq('id', b.id)
    if (error) throw new Error(error.message)

    const merged = { ...blog, ...patch }

    // Reeds gepubliceerd? Wijziging meteen naar Framer pushen.
    let pushed = false, pushError: string | null = null
    if (blog.status === 'gepubliceerd' && account) {
      const config: FramerClientConfig = {
        projectUrl: account.framer_project_url ?? null, apiKeyEncrypted: account.framer_api_key ?? null,
        collectionId: account.framer_blog_collection_id ?? null, fieldMap: (account.framer_field_map ?? null) as Record<string, string> | null,
      }
      const result = await publishBlogToFramer(config, {
        id: merged.id, titel: merged.titel, slug: merged.slug, content: merged.content,
        meta_title: merged.meta_title, meta_description: merged.meta_description, thumbnail_url: merged.thumbnail_url, framer_item_id: merged.framer_item_id,
      }, { confirmOverride: true, accountId: account.id })
      if (result.ok) {
        pushed = true
        const p: Record<string, unknown> = { gepubliceerd_op: new Date().toISOString(), foutmelding: null, sync_status: 'synced' }
        if (result.framerItemId) p.framer_item_id = result.framerItemId
        await admin.from('blogs').update(p).eq('id', b.id)
        await markFramerSync(account.id)
      } else if (!result.pending) {
        pushError = result.error ?? 'Publicatie mislukt'
        await admin.from('blogs').update({ sync_status: 'failed' }).eq('id', b.id)
      }
    }

    try { revalidatePath('/portal/blogs'); revalidatePath('/admin/blogs') } catch { }
    return NextResponse.json({ ok: true, pushed, pushError })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
