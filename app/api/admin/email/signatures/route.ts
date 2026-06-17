import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'

const BUCKET = 'contracts'

// GET — alle handtekeningen + tijdelijke preview-URL
export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('email_signatures').select('*').order('created_at', { ascending: true })
    if (error) throw new Error(error.message)
    const out = await Promise.all((data ?? []).map(async (s: { id: string; name: string; image_path: string | null; is_default: boolean }) => {
      let url: string | null = null
      if (s.image_path) {
        const { data: signed } = await admin.storage.from(BUCKET).createSignedUrl(s.image_path, 60 * 60) // 1u preview
        url = signed?.signedUrl ?? null
      }
      return { id: s.id, name: s.name, is_default: s.is_default, previewUrl: url }
    }))
    return NextResponse.json({ signatures: out })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST (multipart) — naam + PNG uploaden
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const fd = await req.formData()
    const name = (fd.get('name') as string)?.trim()
    if (!name) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    let imagePath: string | null = null
    const file = fd.get('image') as File | null
    if (file && file.size > 0) {
      const ext = (file.name.split('.').pop() ?? 'png').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'png'
      const path = `email-signatures/${randomUUID()}.${ext}`
      const { error: upErr } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type || 'image/png', upsert: false })
      if (upErr) throw new Error(upErr.message)
      imagePath = path
    }

    const makeDefault = fd.get('is_default') === 'true'
    if (makeDefault) await admin.from('email_signatures').update({ is_default: false }).neq('id', '00000000-0000-0000-0000-000000000000')

    const { data, error } = await admin.from('email_signatures').insert({
      name: name.slice(0, 120), image_path: imagePath, is_default: makeDefault, created_by: actor.id,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { id, name?, is_default? } — hernoemen / standaard zetten
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    if (b.is_default === true) {
      await admin.from('email_signatures').update({ is_default: false }).neq('id', b.id)
      const { error } = await admin.from('email_signatures').update({ is_default: true }).eq('id', b.id)
      if (error) throw new Error(error.message)
    }
    if (b.name !== undefined) {
      const { error } = await admin.from('email_signatures').update({ name: String(b.name).slice(0, 120) }).eq('id', b.id)
      if (error) throw new Error(error.message)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE ?id=
export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data: sig } = await admin.from('email_signatures').select('image_path').eq('id', id).maybeSingle()
    if (sig?.image_path) { try { await admin.storage.from(BUCKET).remove([sig.image_path]) } catch { } }
    const { error } = await admin.from('email_signatures').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
