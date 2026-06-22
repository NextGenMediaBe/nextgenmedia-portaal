import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// PATCH { id, action: 'complete' | 'note', note? } — klant werkt eigen taak bij.
// Klant kan taken NIET verwijderen; enkel voltooien of een opmerking toevoegen.
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { id, action, note } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    // Eigendomscheck: hoort de taak bij een klant van deze gebruiker?
    const { data: clients } = await supabase.from('clients').select('id').eq('owner_user_id', user.id)
    const clientIds = (clients ?? []).map((c: { id: string }) => c.id)
    if (clientIds.length === 0) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data: task } = await admin.from('client_tasks').select('id, client_id').eq('id', id).maybeSingle()
    if (!task || !clientIds.includes(task.client_id)) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const patch: Record<string, unknown> = {}
    if (action === 'complete') { patch.status = 'done'; patch.completed_at = new Date().toISOString() }
    if (note !== undefined) patch.client_note = note || null
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijziging' }, { status: 400 })

    const { error } = await admin.from('client_tasks').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    try { revalidatePath('/portal/tasks'); revalidatePath('/admin') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
