import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Niet ingelogd')
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (data?.role !== 'admin') throw new Error('Geen toegang')
  return user
}

// POST — create a new freelancer assignment
export async function POST(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()
    const body = await req.json()
    const {
      title,
      description,
      roles,
      service_slug,
      client_id,
      freelancer_id,
      budget,
      deadline,
    } = body

    if (!title || typeof title !== 'string' || !title.trim()) {
      return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
    }

    const rolesArr: string[] = Array.isArray(roles) ? roles.filter((r): r is string => typeof r === 'string') : []
    if (rolesArr.length === 0) {
      return NextResponse.json({ error: 'Minstens één rol is verplicht' }, { status: 400 })
    }

    // `role` is the (still NOT NULL) singular column from the original schema —
    // we keep it in sync with the first role for backwards compatibility.
    // `roles` is the modern array column.
    const { data, error } = await admin
      .from('freelancer_assignments')
      .insert({
        title: title.trim(),
        description: description?.trim() || null,
        role: rolesArr[0],
        roles: rolesArr,
        service_slug: service_slug || null,
        client_id: client_id || null,
        freelancer_id: freelancer_id || null,
        budget: budget ?? null,
        deadline: deadline || null,
        status: 'open',
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)

    try {
      revalidatePath('/admin/assignments')
      if (freelancer_id) revalidatePath(`/admin/partners/${freelancer_id}`)
    } catch { }

    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH — update assignment (status, roles, budget, assignment to partner, etc.)
const ALLOWED_PATCH_FIELDS = new Set([
  'status', 'title', 'description', 'budget', 'payout',
  'deadline', 'freelancer_id', 'client_id', 'service_slug',
])
const ALLOWED_STATUSES = new Set(['open', 'in_progress', 'completed', 'cancelled'])

export async function PATCH(req: NextRequest) {
  try {
    await assertAdmin()
    const admin = createAdminSupabaseClient()
    const { id, ...rest } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    const patch: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(rest)) {
      if (ALLOWED_PATCH_FIELDS.has(k) && v !== undefined) patch[k] = v
    }
    if (patch.status !== undefined && !ALLOWED_STATUSES.has(patch.status as string)) {
      return NextResponse.json({ error: `Ongeldige status: ${patch.status}` }, { status: 400 })
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    }

    // If marking completed, fetch the assignment first to potentially auto-create
    // a partner ledger entry for the payout.
    let didAutoPayout = false
    if (patch.status === 'completed') {
      const { data: existing } = await admin
        .from('freelancer_assignments')
        .select('freelancer_id, budget, payout, title, client_id, status')
        .eq('id', id)
        .maybeSingle()

      if (existing && existing.status !== 'completed' && existing.freelancer_id) {
        const payoutAmount = Number(existing.payout ?? existing.budget ?? 0)
        if (payoutAmount > 0) {
          // Create a ledger entry of kind 'payout_owed' — only if no settled entry
          // exists for this assignment yet (idempotent on duplicate completion).
          try {
            await admin.from('partner_ledger_entries').insert({
              freelancer_id: existing.freelancer_id,
              kind: 'payout_owed',
              amount: payoutAmount,
              client_id: existing.client_id,
              description: `Opdracht afgerond: ${existing.title}`,
              occurred_on: new Date().toISOString().slice(0, 10),
              status: 'pending',
            })
            didAutoPayout = true
          } catch (ledgerErr) {
            console.error('[assignments] auto-payout ledger insert failed:', ledgerErr)
          }
        }
      }
    }

    const { error } = await admin.from('freelancer_assignments').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    try {
      revalidatePath('/admin/assignments')
      revalidatePath('/admin/partners')
    } catch { }

    return NextResponse.json({ ok: true, auto_payout: didAutoPayout })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
