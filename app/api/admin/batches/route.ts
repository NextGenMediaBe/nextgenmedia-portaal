import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('batches').select('*').order('sort_order', { ascending: true })
    if (error) throw error
    return NextResponse.json({ batches: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('batches').insert({
      name: (b.name ?? 'Batch').toString().slice(0, 60),
      color: b.color || '#3b82f6',
      start_month: Math.min(11, Math.max(0, Number(b.start_month) || 0)),
      shoot_offset: Math.min(3, Math.max(0, Number(b.shoot_offset ?? 1))),
      sort_order: Number(b.sort_order) || 0,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const body = await req.json()
    const admin = createAdminSupabaseClient()

    // Klant aan een batch toewijzen / verplaatsen
    if (body.action === 'assign') {
      if (!body.client_id) return NextResponse.json({ error: 'client_id vereist' }, { status: 400 })
      const { error } = await admin.from('clients').update({ batch_id: body.batch_id || null }).eq('id', body.client_id)
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/maandplanning') } catch { }
      return NextResponse.json({ ok: true })
    }

    // Batch bijwerken
    if (!body.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (body.name !== undefined) patch.name = String(body.name).slice(0, 60)
    if (body.color !== undefined) patch.color = body.color
    if (body.start_month !== undefined) patch.start_month = Math.min(11, Math.max(0, Number(body.start_month)))
    if (body.shoot_offset !== undefined) patch.shoot_offset = Math.min(3, Math.max(0, Number(body.shoot_offset)))
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    const { error } = await admin.from('batches').update(patch).eq('id', body.id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/maandplanning') } catch { }
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
    const { error } = await admin.from('batches').delete().eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/maandplanning') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
