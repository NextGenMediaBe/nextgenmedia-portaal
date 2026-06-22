import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { inclFromExcl, lastDayOfMonth, expandRevenueForMonth, INVOICE_STATUSES, DEFAULT_VAT, type RevenueEntry } from '@/lib/invoices'

// GET ?month=YYYY-MM → facturen + omzet-expansie + maandsamenvatting + klanten
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const month = req.nextUrl.searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()

    const [{ data: invoices }, { data: revenue }, { data: clients }] = await Promise.all([
      admin.from('invoices').select('*').eq('invoice_month', month).order('created_at', { ascending: false }),
      admin.from('revenue_entries').select('*'),
      admin.from('clients').select('id, company_name').is('archived_at', null).order('company_name'),
    ])

    const omzet = expandRevenueForMonth((revenue ?? []) as RevenueEntry[], month)
    const inv = (invoices ?? []) as Array<{ amount_excl: number; revenue_id: string | null; status: string }>

    const omzetExcl = omzet.reduce((s, r) => s + r.amount_excl, 0)
    const linkedExcl = inv.filter((i) => i.revenue_id && i.status !== 'geannuleerd').reduce((s, i) => s + Number(i.amount_excl), 0)
    const pct = omzetExcl > 0 ? Math.min(100, Math.round((linkedExcl / omzetExcl) * 100)) : (inv.length === 0 ? 0 : 100)

    return NextResponse.json({
      invoices: invoices ?? [],
      omzet,
      clients: clients ?? [],
      summary: { omzetExcl, linkedExcl, verschil: Math.max(0, omzetExcl - linkedExcl), pct },
      billingDate: lastDayOfMonth(month),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST — factuur aanmaken, of action 'generate' (recurring voor een maand)
export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const admin = createAdminSupabaseClient()

    if (b.action === 'generate') {
      const month = String(b.month || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Ongeldige maand' }, { status: 400 })
      const [{ data: revenue }, { data: existing }] = await Promise.all([
        admin.from('revenue_entries').select('*'),
        admin.from('invoices').select('revenue_id').eq('invoice_month', month),
      ])
      const have = new Set((existing ?? []).map((e: { revenue_id: string | null }) => e.revenue_id).filter(Boolean))
      const omzet = expandRevenueForMonth((revenue ?? []) as RevenueEntry[], month).filter((r) => r.type === 'recurring' && !have.has(r.revenue_id))
      if (omzet.length === 0) return NextResponse.json({ created: 0 })
      const rows = omzet.map((r) => ({
        client_id: r.client_id, service_slug: r.service_slug, invoice_month: month,
        invoice_date: lastDayOfMonth(month), description: r.title || 'Recurring facturatie',
        amount_excl: r.amount_excl, vat_pct: DEFAULT_VAT, amount_incl: inclFromExcl(r.amount_excl, DEFAULT_VAT),
        status: 'te_factureren', revenue_id: r.revenue_id, created_by: actor.id,
      }))
      const { error } = await admin.from('invoices').insert(rows)
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/invoices') } catch { }
      return NextResponse.json({ created: rows.length })
    }

    // Enkele factuur
    const month = String(b.invoice_month || '').slice(0, 7)
    if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Factuurmaand vereist' }, { status: 400 })
    const amountExcl = Number(b.amount_excl) || 0
    const vat = b.vat_pct != null ? Number(b.vat_pct) : DEFAULT_VAT
    const { data, error } = await admin.from('invoices').insert({
      client_id: b.client_id || null,
      service_slug: b.service_slug || null,
      invoice_month: month,
      invoice_date: b.invoice_date || lastDayOfMonth(month),
      description: b.description || null,
      amount_excl: amountExcl,
      vat_pct: vat,
      amount_incl: inclFromExcl(amountExcl, vat),
      status: INVOICE_STATUSES.includes(b.status) ? b.status : 'te_factureren',
      revenue_id: b.revenue_id || null,
      note: b.note || null,
      created_by: actor.id,
    }).select('id').single()
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/invoices') } catch { }
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { id, ... } — factuur bijwerken / koppelen / status
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()

    const patch: Record<string, unknown> = {}
    if (b.client_id !== undefined) patch.client_id = b.client_id || null
    if (b.service_slug !== undefined) patch.service_slug = b.service_slug || null
    if (b.invoice_date !== undefined) patch.invoice_date = b.invoice_date || null
    if (b.description !== undefined) patch.description = b.description || null
    if (b.note !== undefined) patch.note = b.note || null
    if (b.status !== undefined && INVOICE_STATUSES.includes(b.status)) patch.status = b.status
    if (b.revenue_id !== undefined) patch.revenue_id = b.revenue_id || null
    if (b.amount_excl !== undefined || b.vat_pct !== undefined) {
      // Huidige waarden ophalen om incl. correct te herberekenen.
      const { data: cur } = await admin.from('invoices').select('amount_excl, vat_pct').eq('id', b.id).maybeSingle()
      const excl = b.amount_excl !== undefined ? Number(b.amount_excl) : Number(cur?.amount_excl ?? 0)
      const vat = b.vat_pct !== undefined ? Number(b.vat_pct) : Number(cur?.vat_pct ?? DEFAULT_VAT)
      patch.amount_excl = excl
      patch.vat_pct = vat
      patch.amount_incl = inclFromExcl(excl, vat)
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    const { error } = await admin.from('invoices').update(patch).eq('id', b.id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/invoices') } catch { }
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
    const { error } = await admin.from('invoices').delete().eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/invoices') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
