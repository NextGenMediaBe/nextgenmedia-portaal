import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin, insertResilient } from '@/lib/supabase/server'
import { commissionAmountForYear, commissionPctForYear } from '@/lib/utils'
import { revalidatePath } from 'next/cache'

// POST — create a commission deal for a referred client/job
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id: freelancerId } = await params
    const body = await req.json()

    const {
      client_id, label, service_slug, contract_value, start_date,
      pct_year_1, pct_year_2, pct_year_3, notes,
    } = body

    if (!contract_value || Number(contract_value) <= 0) {
      return NextResponse.json({ error: 'Contractwaarde is verplicht' }, { status: 400 })
    }
    if (!client_id && !label?.trim()) {
      return NextResponse.json({ error: 'Kies een klant of geef een naam/label op' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { data, error } = await insertResilient(
      admin,
      'partner_commission_deals',
      {
        freelancer_id: freelancerId,
        client_id: client_id || null,
        label: label?.trim() || null,
        service_slug: service_slug || null,
        contract_value: Number(contract_value),
        start_date: start_date || new Date().toISOString().slice(0, 10),
        pct_year_1: pct_year_1 != null ? Number(pct_year_1) : 10,
        pct_year_2: pct_year_2 != null ? Number(pct_year_2) : 8,
        pct_year_3: pct_year_3 != null ? Number(pct_year_3) : 5,
        status: 'active',
        notes: notes?.trim() || null,
      },
      { select: '*', required: ['freelancer_id', 'contract_value'] },
    )
    if (error) throw new Error(error.message)

    try { revalidatePath(`/admin/partners/${freelancerId}`) } catch { }
    return NextResponse.json({ deal: data })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH — edit a commission deal (percentages, contract value, status) OR
//         generate a commission ledger entry for a specific year.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id: freelancerId } = await params
    const body = await req.json()
    const { deal_id, action } = body

    if (!deal_id) return NextResponse.json({ error: 'deal_id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()

    // Load the deal (scoped to this partner)
    const { data: deal } = await admin
      .from('partner_commission_deals')
      .select('*')
      .eq('id', deal_id)
      .eq('freelancer_id', freelancerId)
      .maybeSingle()
    if (!deal) return NextResponse.json({ error: 'Commissiedeal niet gevonden' }, { status: 404 })

    // ── Generate a commission payout for a given contract year ──────────────
    if (action === 'generate_year') {
      const year = Number(body.year)
      if (![1, 2, 3, 4, 5].includes(year)) {
        return NextResponse.json({ error: 'Ongeldig jaar' }, { status: 400 })
      }
      const amount = commissionAmountForYear(deal, year)
      const pct = commissionPctForYear(deal, year)
      if (amount <= 0) return NextResponse.json({ error: 'Bedrag is 0' }, { status: 400 })

      // Idempotency: don't create a duplicate for the same deal + year
      const { data: existing } = await admin
        .from('partner_ledger_entries')
        .select('id')
        .eq('commission_deal_id', deal_id)
        .eq('commission_year', year)
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: `Commissie voor jaar ${year} is al aangemaakt` }, { status: 409 })
      }

      const dealName = deal.label || 'aangeleverde klant'
      const { error: ledgerErr } = await insertResilient(
        admin,
        'partner_ledger_entries',
        {
          freelancer_id: freelancerId,
          kind: 'commission_owed',
          direction: 'we_pay_partner',
          amount: amount,                 // positive = we owe partner
          client_id: deal.client_id ?? null,
          commission_deal_id: deal_id,
          commission_year: year,
          description: `Commissie jaar ${year} (${pct}%) — ${dealName}`,
          occurred_on: new Date().toISOString().slice(0, 10),
          status: 'pending',
        },
        { required: ['freelancer_id', 'amount'] },
      )
      if (ledgerErr) throw new Error(ledgerErr.message)

      try { revalidatePath(`/admin/partners/${freelancerId}`) } catch { }
      return NextResponse.json({ ok: true, amount, pct, year })
    }

    // ── Edit deal fields ────────────────────────────────────────────────────
    const patch: Record<string, unknown> = {}
    for (const k of ['label', 'service_slug', 'contract_value', 'start_date', 'pct_year_1', 'pct_year_2', 'pct_year_3', 'status', 'notes', 'client_id'] as const) {
      if (body[k] !== undefined) patch[k] = body[k]
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    }
    const { error } = await admin.from('partner_commission_deals').update(patch).eq('id', deal_id)
    if (error) throw new Error(error.message)

    try { revalidatePath(`/admin/partners/${freelancerId}`) } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE — remove a commission deal
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id: freelancerId } = await params
    const dealId = req.nextUrl.searchParams.get('deal_id')
    if (!dealId) return NextResponse.json({ error: 'deal_id vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from('partner_commission_deals')
      .delete()
      .eq('id', dealId)
      .eq('freelancer_id', freelancerId)
    if (error) throw new Error(error.message)

    try { revalidatePath(`/admin/partners/${freelancerId}`) } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
