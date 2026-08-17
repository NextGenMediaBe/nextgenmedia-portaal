import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient , isActiveStaff } from '@/lib/supabase/server'

// Gebruikt cookies/sessie: nooit statisch renderen.
export const dynamic = 'force-dynamic'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' || (await isActiveStaff(user.id)) ? user : null
}

const VALID_FREQ = ['monthly', 'quarterly', 'annual']

export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('cost_entries').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ costs: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const body = await req.json()
    const { name, category, type, cost_date, start_date, end_date, billing_frequency, amount_excl, vat_pct, notes } = body

    if (!name?.trim()) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })
    if (!amount_excl || Number(amount_excl) <= 0) return NextResponse.json({ error: 'Bedrag is verplicht' }, { status: 400 })
    if (type === 'one_time' && !cost_date) return NextResponse.json({ error: 'Datum is verplicht' }, { status: 400 })
    if (type === 'recurring' && !start_date) return NextResponse.json({ error: 'Startdatum is verplicht' }, { status: 400 })

    const freq = VALID_FREQ.includes(billing_frequency) ? billing_frequency : 'monthly'
    const admin = createAdminSupabaseClient()

    const { data, error } = await admin
      .from('cost_entries')
      .insert({
        name: name.trim(),
        category: category?.trim() || null,
        type: type === 'recurring' ? 'recurring' : 'one_time',
        cost_date: type === 'one_time' ? cost_date : null,
        start_date: type === 'recurring' ? start_date : null,
        end_date: type === 'recurring' ? (end_date || null) : null,
        billing_frequency: type === 'recurring' ? freq : 'monthly',
        amount_excl: Number(amount_excl),
        vat_pct: vat_pct != null ? Number(vat_pct) : 21,
        notes: notes?.trim() || null,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return NextResponse.json({ cost: data })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

/**
 * PATCH — een abonnement stopzetten of weer laten doorlopen.
 *
 * Stopzetten is GEEN verwijderen: de maanden die al geteld hebben moeten blijven
 * staan, anders verandert je boekjaar met terugwerkende kracht. We zetten enkel
 * een einddatum, en de rekenkern telt tot en met die maand mee.
 *
 * `end_date: null` maakt het weer doorlopend — handig als je per ongeluk de
 * verkeerde stopzet.
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id, end_date } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: bestaand } = await admin
      .from('cost_entries').select('type, name, start_date').eq('id', id).maybeSingle()
    if (!bestaand) return NextResponse.json({ error: 'Kost niet gevonden' }, { status: 404 })
    if ((bestaand as { type: string }).type !== 'recurring') {
      return NextResponse.json({ error: 'Alleen een abonnement kan stopgezet worden.' }, { status: 400 })
    }

    let einde: string | null = null
    if (end_date) {
      const d = new Date(String(end_date))
      if (Number.isNaN(d.getTime())) return NextResponse.json({ error: 'Ongeldige datum' }, { status: 400 })
      // Vóór de start stoppen zou een abonnement opleveren dat nooit geteld
      // heeft, terwijl het er in de lijst wél staat. Dan liever verwijderen.
      const start = (bestaand as { start_date: string | null }).start_date
      if (start && String(end_date) < String(start).slice(0, 10)) {
        return NextResponse.json({
          error: 'Die datum ligt vóór de startdatum. Wil je dat dit abonnement nooit geteld heeft, verwijder het dan.',
        }, { status: 400 })
      }
      einde = String(end_date).slice(0, 10)
    }

    const { error } = await admin.from('cost_entries').update({ end_date: einde }).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, end_date: einde })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('cost_entries').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
