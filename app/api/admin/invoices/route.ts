import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  inclFromExcl, lastDayOfMonth, expandRevenueForMonth, normalizeInvoiceStatus,
  recurringActiveInMonth, INVOICE_STATUSES, DEFAULT_VAT, type RevenueEntry, type RecurringInvoice,
} from '@/lib/invoices'

type Row = {
  rowId: string; kind: 'eenmalig' | 'recurring'; sourceId: string; month: string
  client_id: string | null; service_slug: string | null; description: string | null
  amount_excl: number; vat_pct: number; amount_incl: number; status: string; revenue_id: string | null
}

// GET ?month=YYYY-MM → samengevoegde facturen (eenmalig + recurring) + omzet + klanten
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const month = req.nextUrl.searchParams.get('month')
    if (!month) return NextResponse.json({ error: 'month vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()

    const [{ data: invoices }, { data: recurring }, { data: recMonths }, { data: revenue }, { data: clients }] = await Promise.all([
      admin.from('invoices').select('*').eq('invoice_month', month),
      admin.from('recurring_invoices').select('*'),
      admin.from('recurring_invoice_months').select('recurring_id, month, status').eq('month', month),
      admin.from('revenue_entries').select('*'),
      admin.from('clients').select('id, company_name').is('archived_at', null).order('company_name'),
    ])

    const rows: Row[] = []
    for (const i of (invoices ?? []) as Record<string, unknown>[]) {
      rows.push({
        rowId: `one:${i.id}`, kind: 'eenmalig', sourceId: i.id as string, month,
        client_id: (i.client_id ?? null) as string | null, service_slug: (i.service_slug ?? null) as string | null,
        description: (i.description ?? null) as string | null, amount_excl: Number(i.amount_excl), vat_pct: Number(i.vat_pct),
        amount_incl: Number(i.amount_incl), status: normalizeInvoiceStatus(i.status as string), revenue_id: (i.revenue_id ?? null) as string | null,
      })
    }
    const statusByRec = new Map((recMonths ?? []).map((m: { recurring_id: string; status: string }) => [m.recurring_id, m.status]))
    for (const r of (recurring ?? []) as RecurringInvoice[]) {
      if (!recurringActiveInMonth(r, month)) continue
      rows.push({
        rowId: `rec:${r.id}:${month}`, kind: 'recurring', sourceId: r.id, month,
        client_id: r.client_id, service_slug: r.service_slug, description: r.description,
        amount_excl: Number(r.amount_excl), vat_pct: Number(r.vat_pct), amount_incl: Number(r.amount_incl),
        status: normalizeInvoiceStatus(statusByRec.get(r.id) ?? 'te_versturen'), revenue_id: r.revenue_id,
      })
    }

    const omzet = expandRevenueForMonth((revenue ?? []) as RevenueEntry[], month)
    const omzetExcl = omzet.reduce((s, x) => s + x.amount_excl, 0)
    const linkedExcl = rows.filter((r) => r.revenue_id && r.status !== 'geannuleerd').reduce((s, r) => s + r.amount_excl, 0)
    const pct = omzetExcl > 0 ? Math.min(100, Math.round((linkedExcl / omzetExcl) * 100)) : (rows.length === 0 ? 0 : 100)

    return NextResponse.json({
      rows, omzet, clients: clients ?? [],
      summary: { omzetExcl, linkedExcl, verschil: Math.max(0, omzetExcl - linkedExcl), pct },
      billingDate: lastDayOfMonth(month),
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const admin = createAdminSupabaseClient()
    const vat = b.vat_pct != null ? Number(b.vat_pct) : DEFAULT_VAT
    const excl = Number(b.amount_excl) || 0

    // Eenmalige factuur
    if (b.action === 'one_time') {
      const month = String(b.invoice_month || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Factuurmaand vereist' }, { status: 400 })
      const { data, error } = await admin.from('invoices').insert({
        client_id: b.client_id || null, service_slug: b.service_slug || null, invoice_month: month,
        invoice_date: b.invoice_date || lastDayOfMonth(month), description: b.description || null,
        amount_excl: excl, vat_pct: vat, amount_incl: inclFromExcl(excl, vat),
        status: INVOICE_STATUSES.includes(b.status) ? b.status : 'te_versturen',
        revenue_id: b.revenue_id || null, created_by: actor.id,
      }).select('id').single()
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/invoices') } catch { }
      return NextResponse.json({ id: data.id })
    }

    // Recurring factuur-definitie
    if (b.action === 'recurring') {
      const start = String(b.start_month || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(start)) return NextResponse.json({ error: 'Startmaand vereist' }, { status: 400 })
      const end = b.end_month ? String(b.end_month).slice(0, 7) : null
      const { data, error } = await admin.from('recurring_invoices').insert({
        client_id: b.client_id || null, service_slug: b.service_slug || null,
        start_month: start, end_month: end, description: b.description || null,
        amount_excl: excl, vat_pct: vat, amount_incl: inclFromExcl(excl, vat),
        active: b.active !== false, revenue_id: b.revenue_id || null, created_by: actor.id,
      }).select('id').single()
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/invoices') } catch { }
      return NextResponse.json({ id: data.id })
    }

    // Status zetten (werkt voor beide types; recurring per maand)
    if (b.action === 'status') {
      const status = INVOICE_STATUSES.includes(b.status) ? b.status : 'te_versturen'
      if (b.kind === 'recurring') {
        if (!b.source_id || !b.month) return NextResponse.json({ error: 'source_id en month vereist' }, { status: 400 })
        const { error } = await admin.from('recurring_invoice_months').upsert({ recurring_id: b.source_id, month: String(b.month).slice(0, 7), status }, { onConflict: 'recurring_id,month' })
        if (error) throw new Error(error.message)
      } else {
        if (!b.source_id) return NextResponse.json({ error: 'source_id vereist' }, { status: 400 })
        const { error } = await admin.from('invoices').update({ status }).eq('id', b.source_id)
        if (error) throw new Error(error.message)
      }
      try { revalidatePath('/admin/invoices') } catch { }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH { kind, id, ...velden } — eenmalige factuur of recurring-definitie bewerken/koppelen
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    if (!b.id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const table = b.kind === 'recurring' ? 'recurring_invoices' : 'invoices'

    const patch: Record<string, unknown> = {}
    if (b.client_id !== undefined) patch.client_id = b.client_id || null
    if (b.service_slug !== undefined) patch.service_slug = b.service_slug || null
    if (b.description !== undefined) patch.description = b.description || null
    if (b.revenue_id !== undefined) patch.revenue_id = b.revenue_id || null
    if (b.kind === 'recurring') {
      if (b.start_month !== undefined) patch.start_month = String(b.start_month).slice(0, 7)
      if (b.end_month !== undefined) patch.end_month = b.end_month ? String(b.end_month).slice(0, 7) : null
      if (b.active !== undefined) patch.active = !!b.active
    } else {
      if (b.invoice_date !== undefined) patch.invoice_date = b.invoice_date || null
    }
    if (b.amount_excl !== undefined || b.vat_pct !== undefined) {
      const { data: cur } = await admin.from(table).select('amount_excl, vat_pct').eq('id', b.id).maybeSingle()
      const excl = b.amount_excl !== undefined ? Number(b.amount_excl) : Number(cur?.amount_excl ?? 0)
      const vat = b.vat_pct !== undefined ? Number(b.vat_pct) : Number(cur?.vat_pct ?? DEFAULT_VAT)
      patch.amount_excl = excl; patch.vat_pct = vat; patch.amount_incl = inclFromExcl(excl, vat)
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Geen wijzigingen' }, { status: 400 })
    const { error } = await admin.from(table).update(patch).eq('id', b.id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/invoices') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE ?kind=&id=
export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    const kind = req.nextUrl.searchParams.get('kind')
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const table = kind === 'recurring' ? 'recurring_invoices' : 'invoices'
    const { error } = await admin.from(table).delete().eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/invoices') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
