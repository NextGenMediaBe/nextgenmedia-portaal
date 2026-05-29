import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

const VALID_FREQ = ['monthly', 'quarterly', 'semi-annual', 'annual']

export async function GET() {
  try {
    // SECURITY: revenue is admin-only sensitive data
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin
      .from('revenue_entries')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ entries: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const body = await req.json()
    const {
      title, client_id, service_slug, type, billing_frequency,
      amount_per_month, start_month, end_month, months_count,
      amount, transaction_month, notes,
    } = body

    if (!client_id || !type) {
      return NextResponse.json({ error: 'client_id en type zijn verplicht' }, { status: 400 })
    }
    if (type === 'recurring' && (!amount_per_month || !start_month)) {
      return NextResponse.json({ error: 'Bedrag en startmaand zijn verplicht' }, { status: 400 })
    }
    if (type === 'one_time' && (!amount || !transaction_month)) {
      return NextResponse.json({ error: 'Bedrag en transactiemaand zijn verplicht' }, { status: 400 })
    }

    const freq = VALID_FREQ.includes(billing_frequency) ? billing_frequency : 'monthly'

    // Resolve end_month from months_count
    let resolvedEndMonth: string | null = end_month ?? null
    if (type === 'recurring' && !resolvedEndMonth && months_count) {
      const start = new Date(start_month)
      start.setMonth(start.getMonth() + Number(months_count) - 1)
      resolvedEndMonth = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-01`
    }

    const admin = createAdminSupabaseClient()

    // Try full insert (with title + billing_frequency columns added in migration 20260527000002)
    const { data, error } = await admin
      .from('revenue_entries')
      .insert({
        title: title || null,
        client_id,
        service_slug: service_slug || null,
        type,
        billing_frequency: freq,
        amount_per_month: type === 'recurring' ? Number(amount_per_month) : null,
        start_month: type === 'recurring' ? start_month : null,
        end_month: resolvedEndMonth,
        amount: type === 'one_time' ? Number(amount) : null,
        transaction_month: type === 'one_time' ? transaction_month : null,
        notes: notes || null,
      })
      .select('*')
      .single()

    // If columns don't exist yet (migration not yet run), fall back without them
    if (error) {
      const missingCol = error.message?.includes('title') || error.message?.includes('billing_frequency') || error.code === '42703'
      if (missingCol) {
        const { data: data2, error: error2 } = await admin
          .from('revenue_entries')
          .insert({
            client_id,
            service_slug: service_slug || null,
            type,
            amount_per_month: type === 'recurring' ? Number(amount_per_month) : null,
            start_month: type === 'recurring' ? start_month : null,
            end_month: resolvedEndMonth,
            amount: type === 'one_time' ? Number(amount) : null,
            transaction_month: type === 'one_time' ? transaction_month : null,
            notes: notes || null,
          })
          .select('*')
          .single()
        if (error2) throw new Error(error2.message)
        return NextResponse.json({ entry: data2 })
      }
      throw new Error(error.message)
    }
    return NextResponse.json({ entry: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('revenue_entries').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
