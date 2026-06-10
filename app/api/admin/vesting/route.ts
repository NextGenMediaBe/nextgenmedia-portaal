import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { mergeVestingConfig, attributionFor } from '@/lib/vesting'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

// POST — nieuwe vestigingsomzet-registratie
export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const body = await req.json()
    const { client_name, service_slug, entry_date, net_revenue, type, outbound_pct } = body
    if (!net_revenue || Number(net_revenue) <= 0) return NextResponse.json({ error: 'Netto omzet is verplicht' }, { status: 400 })
    const t = ['inbound', 'outbound', 'website'].includes(type) ? type : 'inbound'

    const admin = createAdminSupabaseClient()
    const { data: cfgRow } = await admin.from('vesting_config').select('*').eq('id', 1).maybeSingle()
    const cfg = mergeVestingConfig(cfgRow)

    const net = Number(net_revenue)
    const attribution = attributionFor(t, cfg, Number(outbound_pct) || 0)
    const vesting = Math.round((net * attribution) / 100 * 100) / 100

    const { error } = await admin.from('vesting_revenue').insert({
      client_name: client_name?.trim() || null,
      service_slug: service_slug || null,
      entry_date: entry_date || new Date().toISOString().slice(0, 10),
      net_revenue: net,
      type: t,
      attribution_pct: attribution,
      vesting_revenue: vesting,
    })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, vesting })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// PATCH — config bijwerken (één rij, id=1)
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const body = await req.json()
    const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString() }
    for (const k of ['schijf2_per', 'schijf3_y1', 'schijf3_y2', 'schijf3_y3', 'inbound_pct', 'website_pct'] as const) {
      if (body[k] !== undefined && body[k] !== '') row[k] = Number(body[k])
    }
    if (body.start_date !== undefined) row.start_date = body.start_date || null
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('vesting_config').upsert(row, { onConflict: 'id' })
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE ?id= — registratie verwijderen
export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('vesting_revenue').delete().eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
