import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { requirePortalPermission } from '@/lib/portal-auth'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const BUCKET = 'cms-media'
const MAX = 20 * 1024 * 1024 // 20 MB

// POST (multipart) — klant uploadt een afbeelding/bestand vanaf zijn pc. We slaan
// het op in een publieke Supabase-bucket en geven de publieke URL terug; die URL
// gebruikt de klant als waarde voor een image/file-veld (Framer accepteert URL's).
export async function POST(req: NextRequest) {
  const g = await requirePortalPermission('cms', 'edit')
  if (!g.ok) return g.response
  try {
    const fd = await req.formData()
    const file = fd.get('file') as File | null
    if (!file || file.size === 0) return NextResponse.json({ error: 'Geen bestand' }, { status: 400 })
    if (file.size > MAX) return NextResponse.json({ error: 'Bestand te groot (max 20 MB)' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    // Bucket idempotent aanmaken (publiek) zodat de URL rechtstreeks werkt.
    try { await admin.storage.createBucket(BUCKET, { public: true }) } catch { /* bestaat al */ }

    const ext = (file.name.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
    const path = `${g.session.clientId}/${randomUUID()}.${ext}`
    const { error } = await admin.storage.from(BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || 'application/octet-stream', upsert: false,
    })
    if (error) throw new Error(error.message)

    const { data } = admin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upload mislukt' }, { status: 400 })
  }
}
