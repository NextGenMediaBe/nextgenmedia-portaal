import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const { id } = await params
    const body = await req.json()
    const { notes } = body

    const admin = createAdminSupabaseClient()

    // Fetch all pending ledger entries for this partner
    const { data: entries, error: fetchErr } = await admin
      .from('partner_ledger_entries')
      .select('id, amount, occurred_on')
      .eq('freelancer_id', id)
      .eq('status', 'pending')

    if (fetchErr) throw fetchErr

    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: 'Geen openstaande items om af te rekenen' }, { status: 400 })
    }

    // Calculate totals (positive entries = owed to partner, negative = partner owes us)
    const totalOwedToPartner = entries.filter((e) => Number(e.amount) > 0).reduce((s, e) => s + Number(e.amount), 0)
    const totalOwedByPartner = entries.filter((e) => Number(e.amount) < 0).reduce((s, e) => s + Math.abs(Number(e.amount)), 0)
    const netAmount = totalOwedToPartner - totalOwedByPartner

    // Determine period from occurred_on dates
    const dates = entries.map((e) => e.occurred_on as string).sort()
    const periodStart = dates[0]
    const periodEnd = dates[dates.length - 1]

    // Create settlement record
    const { data: settlement, error: settlErr } = await admin
      .from('partner_settlements')
      .insert({
        freelancer_id: id,
        period_start: periodStart,
        period_end: periodEnd,
        total_owed_to_partner: totalOwedToPartner,
        total_owed_by_partner: totalOwedByPartner,
        net_amount: netAmount,
        status: 'draft',
        notes: notes || null,
        finalized_at: null,
        paid_at: null,
      })
      .select('*')
      .single()

    if (settlErr) throw settlErr

    // Mark all pending entries as settled and link to this settlement
    const entryIds = entries.map((e) => e.id)
    const { error: updateErr } = await admin
      .from('partner_ledger_entries')
      .update({ status: 'settled', settlement_id: settlement.id })
      .in('id', entryIds)

    if (updateErr) throw updateErr

    return NextResponse.json({ settlement })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
