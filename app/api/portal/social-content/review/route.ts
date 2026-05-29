import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { data: client } = await supabase
      .from('clients').select('id').eq('owner_user_id', user.id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Geen klantprofiel' }, { status: 403 })

    const { id, decision, feedback } = await req.json()

    if (decision === 'changes_requested' && !feedback?.trim()) {
      return NextResponse.json({ error: 'Feedback is verplicht bij wijzigingsverzoek' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from('social_content_items')
      .update({
        status: decision,
        client_feedback: feedback || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', client.id)

    if (error) throw new Error(error.message)

    try {
      revalidatePath('/portal')
      revalidatePath('/portal/social-media')
      revalidatePath('/admin/services/social-media')
    } catch { }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
