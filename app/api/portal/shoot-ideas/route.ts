import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { randomUUID } from 'crypto'

const BUCKET = 'contracts'

// POST (multipart) — klant voegt een idee toe aan een shoot van zijn eigen klant.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const fd = await req.formData()
    const shootId = fd.get('shoot_id') as string
    const title = (fd.get('title') as string)?.trim()
    const description = (fd.get('description') as string)?.trim()
    if (!shootId || (!title && !description)) return NextResponse.json({ error: 'Titel of omschrijving vereist' }, { status: 400 })

    const { data: client } = await supabase.from('clients').select('id').eq('owner_user_id', user.id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Geen klantprofiel' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data: shoot } = await admin.from('shoot_briefings').select('id, client_id').eq('id', shootId).maybeSingle()
    if (!shoot || shoot.client_id !== client.id) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    // Optionele upload
    let attachmentPath: string | null = null
    const file = fd.get('attachment') as File | null
    if (file && file.size > 0) {
      const ext = (file.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
      const path = `shoot-ideas/${client.id}/${randomUUID()}.${ext}`
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'image/jpeg', upsert: false })
      if (!upErr) attachmentPath = path
    }

    const { error } = await admin.from('shoot_ideas').insert({
      shoot_id: shootId, client_id: client.id, title: title || null, description: description || null,
      attachment_path: attachmentPath, status: 'new',
    })
    if (error) throw new Error(error.message)

    try { revalidatePath('/portal/social-media') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
