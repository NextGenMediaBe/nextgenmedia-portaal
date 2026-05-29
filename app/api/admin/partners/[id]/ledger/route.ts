import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

const VALID_KINDS = ['commission_owed', 'payout_owed', 'service_billed', 'manual_credit', 'manual_debit']

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { kind, amount, client_id, description, occurred_on } = body

    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json({ error: 'Ongeldig type' }, { status: 400 })
    }
    if (amount === undefined || amount === null || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'Bedrag is verplicht' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    // Verify partner exists
    const { data: partner } = await admin.from('freelancers').select('id').eq('id', id).maybeSingle()
    if (!partner) return NextResponse.json({ error: 'Partner niet gevonden' }, { status: 404 })

    const { data, error } = await admin
      .from('partner_ledger_entries')
      .insert({
        freelancer_id: id,
        kind,
        amount: Number(amount),
        client_id: client_id || null,
        description: description || null,
        occurred_on: occurred_on || new Date().toISOString().slice(0, 10),
        status: 'pending',
      })
      .select('*')
      .single()

    if (error) throw error
    return NextResponse.json({ entry: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
