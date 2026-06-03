import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// POST — klant plaatst feedback op een shoot-briefing van zijn eigen klant.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { shoot_id, message } = await req.json()
    if (!shoot_id || !message?.trim()) {
      return NextResponse.json({ error: 'Bericht is verplicht' }, { status: 400 })
    }

    // Zoek de klant van deze gebruiker
    const { data: client } = await supabase
      .from('clients').select('id').eq('owner_user_id', user.id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Geen klantprofiel' }, { status: 403 })

    const admin = createAdminSupabaseClient()

    // Eigendomscheck: hoort de shoot bij deze klant?
    const { data: shoot } = await admin
      .from('shoot_briefings').select('id, client_id').eq('id', shoot_id).maybeSingle()
    if (!shoot || shoot.client_id !== client.id) {
      return NextResponse.json({ error: 'Geen toegang tot deze shoot' }, { status: 403 })
    }

    const { error } = await admin.from('shoot_briefing_feedback').insert({
      shoot_id,
      client_id: client.id,
      author_role: 'client',
      message: String(message).trim(),
    })
    if (error) throw new Error(error.message)

    try { revalidatePath('/portal/social-media') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
