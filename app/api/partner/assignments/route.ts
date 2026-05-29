import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// POST — partner creates a new inbound assignment proposal for NextGenMedia
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { data: partner } = await supabase
      .from('freelancers')
      .select('id, name')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!partner) return NextResponse.json({ error: 'Geen partneraccount' }, { status: 403 })

    const {
      title,
      description,
      service_slug,
      proposed_budget,
      proposed_hours,
      hourly_rate,
      deadline,
    } = await req.json()

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
    }

    // Compute budget from hours × rate if not directly supplied
    const budget = proposed_budget ?? (
      proposed_hours && hourly_rate
        ? Math.round(proposed_hours * hourly_rate * 100) / 100
        : null
    )

    const admin = createAdminSupabaseClient()

    // Create assignment with status 'proposed' — admin reviews and accepts
    const { data: row, error } = await admin
      .from('freelancer_assignments')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        freelancer_id: partner.id,
        service_slug: service_slug || null,
        budget: budget ?? null,
        payout: budget ?? null,   // proposed payout = proposed budget by default
        deadline: deadline || null,
        status: 'open',           // visible to admin immediately
        role: 'other',            // required NOT NULL field
        roles: [],
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)

    try {
      revalidatePath('/partner/assignments')
      revalidatePath('/admin/assignments')
    } catch { }

    return NextResponse.json({ id: row.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

const ALLOWED_STATUSES = new Set(['in_progress', 'completed', 'cancelled'])

export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

    const { data: partner } = await supabase
      .from('freelancers').select('id').eq('user_id', user.id).maybeSingle()
    if (!partner) return NextResponse.json({ error: 'Geen partneraccount' }, { status: 403 })

    const { id, status } = await req.json()
    if (!ALLOWED_STATUSES.has(status)) {
      return NextResponse.json({ error: 'Ongeldige status' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    // If completing, mirror the admin auto-payout logic — but scope it to this partner only.
    let didAutoPayout = false
    if (status === 'completed') {
      const { data: existing } = await admin
        .from('freelancer_assignments')
        .select('budget, payout, title, client_id, status')
        .eq('id', id)
        .eq('freelancer_id', partner.id)
        .maybeSingle()

      if (existing && existing.status !== 'completed') {
        const payoutAmount = Number(existing.payout ?? existing.budget ?? 0)
        if (payoutAmount > 0) {
          try {
            await admin.from('partner_ledger_entries').insert({
              freelancer_id: partner.id,
              kind: 'payout_owed',
              amount: payoutAmount,
              client_id: existing.client_id,
              description: `Opdracht afgerond: ${existing.title}`,
              occurred_on: new Date().toISOString().slice(0, 10),
              status: 'pending',
            })
            didAutoPayout = true
          } catch (ledgerErr) {
            console.error('[partner/assignments] auto-payout failed:', ledgerErr)
          }
        }
      }
    }

    const { error } = await admin
      .from('freelancer_assignments')
      .update({ status })
      .eq('id', id)
      .eq('freelancer_id', partner.id)
    if (error) throw new Error(error.message)

    try {
      revalidatePath('/partner/assignments')
      revalidatePath('/partner')
      revalidatePath('/admin/assignments')
    } catch { }

    return NextResponse.json({ ok: true, auto_payout: didAutoPayout })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
