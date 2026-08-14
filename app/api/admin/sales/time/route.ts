import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff, requireAdmin } from '@/lib/supabase/server'
import { getOrCreateSetter, listSetters, monthPeriod } from '@/lib/sales/setters'
import { syncRecentSetterInvoices } from '@/lib/sales/setter-invoices'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * De gewerkte periodes van een setter: bekijken en verwijderen.
 *
 * Een admin ziet en beheert die van iedereen. Een setter enkel de zijne — ook
 * bij het verwijderen, en dat wordt hier gecontroleerd en niet in het scherm.
 */

async function scope() {
  const actor = await requireStaff()
  if (!actor) return null
  const isAdmin = !!(await requireAdmin())
  const me = isAdmin
    ? null
    : await getOrCreateSetter(actor.id, actor.email?.split('@')[0] ?? 'Setter', actor.email ?? null)
  return { actor, isAdmin, meId: me?.id ?? null }
}

// GET ?month=YYYY-MM-01&setter=<id>
export async function GET(req: NextRequest) {
  try {
    const s = await scope()
    if (!s) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const m = sp.get('month')
    const base = m ? new Date(`${m}T12:00:00`) : new Date()
    const period = monthPeriod(Number.isFinite(base.getTime()) ? base : new Date())

    // Wie mag je zien? Een setter altijd enkel zichzelf.
    let ids: string[]
    if (s.isAdmin) {
      const all = await listSetters()
      const wanted = sp.get('setter') ?? ''
      ids = all.some((x) => x.id === wanted) ? [wanted] : all.map((x) => x.id)
    } else {
      if (!s.meId) return NextResponse.json({ entries: [] })
      ids = [s.meId]
    }
    if (ids.length === 0) return NextResponse.json({ entries: [] })

    const admin = createAdminSupabaseClient()
    const { data } = await admin.from('sales_time_entries')
      .select('id, setter_id, started_at, ended_at, note, source')
      .in('setter_id', ids)
      .gte('started_at', period.from.toISOString())
      .lt('started_at', period.to.toISOString())
      .order('started_at', { ascending: false })
      .limit(400)

    const setters = await listSetters()
    const nameById = new Map(setters.map((x) => [x.id, x.name]))
    const entries = ((data ?? []) as {
      id: string; setter_id: string; started_at: string; ended_at: string | null
      note: string | null; source: string
    }[]).map((e) => ({ ...e, setterName: nameById.get(e.setter_id) ?? 'Setter' }))

    return NextResponse.json({ entries, isAdmin: s.isAdmin })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

// DELETE ?id= — één periode wissen.
export async function DELETE(req: NextRequest) {
  try {
    const s = await scope()
    if (!s) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: row } = await admin.from('sales_time_entries')
      .select('id, setter_id, started_at, ended_at').eq('id', id).maybeSingle()
    if (!row) return NextResponse.json({ error: 'Periode niet gevonden' }, { status: 404 })

    const entry = row as { id: string; setter_id: string; started_at: string; ended_at: string | null }
    // Een setter mag enkel zijn eigen tijd wissen.
    if (!s.isAdmin && entry.setter_id !== s.meId) {
      return NextResponse.json({ error: 'Dit is niet jouw tijdregistratie' }, { status: 403 })
    }

    const { error } = await admin.from('sales_time_entries').delete().eq('id', id)
    if (error) throw new Error(error.message)

    // Minder uren = een lagere factuur; die moet mee.
    await syncRecentSetterInvoices()

    // Uren wissen verandert wat er uitbetaald wordt, dus dit hoort in het
    // logboek — ook wanneer iemand zijn eigen tijd verwijdert.
    const meta = requestMeta(req)
    await logAudit({
      action: 'sales.time.delete', entityType: 'sales_setter', entityId: entry.setter_id,
      summary: `Verkoop: gewerkte periode van ${new Date(entry.started_at).toLocaleString('nl-BE')} verwijderd`,
      actorUserId: s.actor.id, actorEmail: s.actor.email ?? null, actorRole: s.isAdmin ? 'admin' : 'employee',
      ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, wasRunning: entry.ended_at === null })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
