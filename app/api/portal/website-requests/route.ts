import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'

// Store images in the 'contracts' bucket (always exists, admin service role bypasses RLS)
// under a webdesign/ prefix so they stay separate from contract PDFs.
const STORAGE_BUCKET = 'contracts'
const IMAGE_PATH_PREFIX = 'webdesign'
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 2 // 2 years

// All portal-submitted requests are minor by definition; the schema-level kind
// has a CHECK ('minor','major') constraint, so we always store 'minor' and
// surface the user-facing kind via `categories[0]` / description prefix.
const SCHEMA_KIND = 'minor'

// PostgREST error codes for missing column / check-constraint violation.
const RETRIABLE_ERR_CODES = new Set(['PGRST204', '42703', '23514'])

// Insert payload keys ordered most→least preferred — when the schema rejects
// the request we drop them one at a time until it sticks.
const DROPPABLE_KEYS = ['categories', 'image_paths'] as const

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const formData = await req.formData()
    const client_id = formData.get('client_id') as string
    const title = formData.get('title') as string
    const description = formData.get('description') as string | null
    const friendlyKind = (formData.get('kind') as string) || 'other'
    const imageFiles = formData.getAll('images') as File[]

    if (!client_id || !title) {
      return NextResponse.json({ error: 'client_id en titel zijn verplicht' }, { status: 400 })
    }

    // Verify the logged-in user owns this client
    const { data: clientData } = await supabase
      .from('clients').select('id').eq('id', client_id).eq('owner_user_id', user.id).maybeSingle()
    if (!clientData) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()

    // Upload all images in parallel; preserve order in the returned arrays.
    const uploadResults = await Promise.all(
      imageFiles
        .filter((img) => img && img.size > 0)
        .map(async (img) => {
          const ext = (img.name.split('.').pop() ?? 'jpg').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'jpg'
          const storagePath = `${IMAGE_PATH_PREFIX}/${client_id}/${randomUUID()}.${ext}`
          const { error: uploadErr } = await admin.storage
            .from(STORAGE_BUCKET)
            .upload(storagePath, Buffer.from(await img.arrayBuffer()), {
              contentType: img.type || 'image/jpeg',
              upsert: false,
            })
          if (uploadErr) {
            console.error('[website-requests] image upload error:', uploadErr.message)
            return null
          }
          const { data: urlData } = await admin.storage
            .from(STORAGE_BUCKET)
            .createSignedUrl(storagePath, SIGNED_URL_TTL)
          return { path: storagePath, url: urlData?.signedUrl ?? null }
        })
    )

    const imagePaths: string[] = []
    const imageUrls: string[] = []
    for (const r of uploadResults) {
      if (!r) continue
      imagePaths.push(r.path)
      if (r.url) imageUrls.push(r.url)
    }

    // Build the insert payload. The schema may be missing optional columns
    // (categories, image_paths) — when we hit a known retriable error we drop
    // the next droppable key and retry. The friendly kind is also embedded in
    // description as `[kind] ...` so it survives even when categories is gone.
    const descriptionWithKind = description?.trim()
      ? `[${friendlyKind}] ${description.trim()}`
      : `[${friendlyKind}]`

    const payload: Record<string, unknown> = {
      client_id,
      title,
      description: descriptionWithKind,
      kind: SCHEMA_KIND,
      status: 'new',
      image_urls: imageUrls,
      image_paths: imagePaths,
      categories: [friendlyKind],
    }

    let inserted: { id: string } | null = null
    let lastErr: { message?: string; code?: string } | null = null
    for (let attempt = 0; attempt <= DROPPABLE_KEYS.length; attempt++) {
      const { data, error } = await admin
        .from('webdesign_change_requests')
        .insert(payload)
        .select('id')
        .single()
      if (!error) { inserted = data; lastErr = null; break }
      lastErr = error
      if (!RETRIABLE_ERR_CODES.has(error.code ?? '')) break
      // Drop the next problematic key and retry
      if (attempt < DROPPABLE_KEYS.length) delete payload[DROPPABLE_KEYS[attempt]]
    }

    if (!inserted) {
      console.error('[website-requests] insert failed:', lastErr?.message)
      throw new Error(lastErr?.message ?? 'Insert mislukt')
    }

    try {
      revalidatePath('/admin/services/website')
      revalidatePath('/portal/website')
      revalidatePath('/admin')
    } catch { }

    return NextResponse.json({ id: inserted.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
