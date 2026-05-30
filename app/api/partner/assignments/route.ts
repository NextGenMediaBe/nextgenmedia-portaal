import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient, insertResilient } from '@/lib/supabase/server'
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

    // Insert resiliently: optional columns (role, roles, payout, service_slug)
    // exist only in some schema versions. The helper drops any column the live
    // DB doesn't have and retries, so this works regardless of applied migrations.
    const { data: row, error } = await insertResilient(
      admin,
      'freelancer_assignments',
      {
        title: title.trim(),
        description: description?.trim() || null,
        freelancer_id: partner.id,
        service_slug: service_slug || null,
        budget: budget ?? null,
        payout: budget ?? null,   // proposed payout = proposed budget by default
        deadline: deadline || null,
        status: 'open',           // visible to admin immediately
        origin: 'partner',        // inbound proposal from partner → NextGenMedia
        role: 'other',            // present in legacy schema (NOT NULL there)
        roles: [],                // present in newer schema
      },
      { required: ['title', 'freelancer_id', 'status'] },
    )

    if (error) throw new Error(error.message)

    try {
      revalidatePath('/partner/assignments')
      revalidatePath('/admin/assignments')
    } catch { }

    return NextResponse.json({ id: row?.id })
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
    // select('*') so a missing column never makes the fetch silently fail.
    let didAutoPayout = false
    if (status === 'completed') {
      const { data: existing } = await admin
        .from('freelancer_assignments')
        .select('*')
        .eq('id', id)
        .eq('freelancer_id', partner.id)
        .maybeSingle()

      if (existing && existing.status !== 'completed') {
        const payoutAmount = Number(existing.payout ?? existing.budget ?? 0)
        if (payoutAmount > 0) {
          const { error: ledgerErr } = await insertResilient(
            admin,
            'partner_ledger_entries',
            {
              freelancer_id: partner.id,
              kind: 'payout_owed',
              amount: payoutAmount,
              client_id: existing.client_id ?? null,
              description: `Opdracht afgerond: ${existing.title}`,
              occurred_on: new Date().toISOString().slice(0, 10),
              status: 'pending',
            },
            { required: ['freelancer_id', 'amount'] },
          )
          if (!ledgerErr) didAutoPayout = true
          else console.error('[partner/assignments] auto-payout failed:', ledgerErr.message)
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
