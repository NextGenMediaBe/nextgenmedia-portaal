import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { PHASE_KEYS } from '@/lib/month-phases'

// Klantgerichte maandplanning: koppel klanten per maand aan een fase.

// GET ?month=YYYY-MM
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const month = req.nextUrl.searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('month_planning_clients')
      .select('*')
      .eq('plan_month', month)
      .order('sort_order', { ascending: true })
    if (error) throw new Error(error.message)
    return NextResponse.json({ entries: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST { plan_month, client_id, phase, planning_type?, note? }
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.plan_month || !b.client_id || !b.phase) return NextResponse.json({ error: 'plan_month, client_id en phase vereist' }, { status: 400 })
    if (!PHASE_KEYS.includes(b.phase)) return NextResponse.json({ error: 'Ongeldige fase' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('month_planning_clients').insert({
      plan_month: String(b.plan_month).slice(0, 7),
      client_id: b.client_id,
      phase: b.phase,
      planning_type: b.planning_type || 'standaard',
      note: b.note || null,
      created_by: actor.id,
    }).select('id').single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { id, phase?, planning_type?, note? } — verplaatsen / bewerken
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const patch: Record<string, unknown> = {}
    if (b.phase !== undefined) {
      if (!PHASE_KEYS.includes(b.phase)) return NextResponse.json({ error: 'Ongeldige fase' }, { status: 400 })
      patch.phase = b.phase
    }
    if (b.planning_type !== undefined) patch.planning_type = b.planning_type || 'standaard'
    if (b.note !== undefined) patch.note = b.note || null
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('month_planning_clients').update(patch).eq('id', b.id)
    if (error) throw new Error(error.message)
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
    const { error } = await admin.from('month_planning_clients').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
