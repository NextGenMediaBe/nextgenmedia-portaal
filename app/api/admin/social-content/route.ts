import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'admin') throw new Error('Geen toegang')
  return user
}

export async function GET(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()
    const clientId = req.nextUrl.searchParams.get('clientId')
    let query = admin.from('social_content_items').select('*').order('planned_date', { ascending: true })
    if (clientId) query = query.eq('client_id', clientId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ items: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()
    const body = await req.json()
    const { clientId, title, platforms, platform, content_type, planned_date, caption, script, media_notes, status } = body

    // Support both `platforms` (array) and legacy `platform` (string)
    const resolvedPlatforms: string[] = Array.isArray(platforms) && platforms.length > 0
      ? platforms
      : platform ? [platform] : []
    const primaryPlatform: string = resolvedPlatforms[0] ?? platform ?? ''

    const { data: row, error } = await admin
      .from('social_content_items')
      .insert({
        client_id: clientId,
        title, platform: primaryPlatform, platforms: resolvedPlatforms,
        content_type, planned_date,
        caption: caption || null,
        script: script || null,
        media_notes: media_notes || null,
        status: status || 'draft',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ id: row.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()
    const body = await req.json()
    const { id, platforms: rawPlatforms, platform: rawPlatform, ...rest } = body
    const clean: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) clean[k] = v === '' ? null : v
    }
    // Sync platforms array + primary platform
    if (rawPlatforms !== undefined || rawPlatform !== undefined) {
      const resolvedPlatforms: string[] = Array.isArray(rawPlatforms) && rawPlatforms.length > 0
        ? rawPlatforms
        : rawPlatform ? [rawPlatform] : []
      clean.platforms = resolvedPlatforms
      clean.platform = resolvedPlatforms[0] ?? rawPlatform ?? null
    }
    const { error } = await admin.from('social_content_items').update(clean).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()

    // Two modes:
    //  - single delete: ?id=<uuid>
    //  - bulk delete:   POST body { ids: ["uuid", ...] }
    const id = req.nextUrl.searchParams.get('id')

    // Try to parse body for bulk delete (gracefully handle empty body for single mode)
    let ids: string[] | null = null
    try {
      const body = await req.json().catch(() => null)
      if (body && Array.isArray(body.ids) && body.ids.length > 0) {
        ids = body.ids.filter((v: unknown): v is string => typeof v === 'string')
      }
    } catch { /* no body — single delete via query param */ }

    if (ids && ids.length > 0) {
      const { error } = await admin.from('social_content_items').delete().in('id', ids)
      if (error) throw new Error(error.message)

      try {
        revalidatePath('/admin/services/social-media')
        revalidatePath('/portal/social-media')
      } catch { }

      return NextResponse.json({ ok: true, deleted: ids.length })
    }

    if (!id) return NextResponse.json({ error: 'Geen ID(s)' }, { status: 400 })

    const { error } = await admin.from('social_content_items').delete().eq('id', id)
    if (error) throw new Error(error.message)

    try {
      revalidatePath('/admin/services/social-media')
      revalidatePath('/portal/social-media')
    } catch { }

    return NextResponse.json({ ok: true, deleted: 1 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
