import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

const VALID_FREQ = ['monthly', 'quarterly', 'annual']

export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('cost_entries').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ costs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const body = await req.json()
    const { name, category, type, cost_date, start_date, end_date, billing_frequency, amount_excl, vat_pct, notes } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })
    if (!amount_excl || Number(amount_excl) <= 0) return NextResponse.json({ error: 'Bedrag is verplicht' }, { status: 400 })
    if (type === 'one_time' && !cost_date) return NextResponse.json({ error: 'Datum is verplicht' }, { status: 400 })
    if (type === 'recurring' && !start_date) return NextResponse.json({ error: 'Startdatum is verplicht' }, { status: 400 })

    const freq = VALID_FREQ.includes(billing_frequency) ? billing_frequency : 'monthly'
    const admin = createAdminSupabaseClient()

    const { data, error } = await admin
      .from('cost_entries')
      .insert({
        name: name.trim(),
        category: category?.trim() || null,
        type: type === 'recurring' ? 'recurring' : 'one_time',
        cost_date: type === 'one_time' ? cost_date : null,
        start_date: type === 'recurring' ? start_date : null,
        end_date: type === 'recurring' ? (end_date || null) : null,
        billing_frequency: type === 'recurring' ? freq : 'monthly',
        amount_excl: Number(amount_excl),
        vat_pct: vat_pct != null ? Number(vat_pct) : 21,
        notes: notes?.trim() || null,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ cost: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('cost_entries').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
