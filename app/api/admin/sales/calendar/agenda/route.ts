import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { getOrCreateSalesOrg } from '@/lib/sales/service'
import { SIGNATURES } from '@/lib/sales/signatures'

export const dynamic = 'force-dynamic'

/**
 * Naam en e-mailhandtekening van een gekoppelde agenda aanpassen.
 * Bij het koppelen worden die al gevraagd; dit is om ze nadien te wijzigen.
 */
export async function PATCH(req: NextRequest) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const id = String(b.id ?? '')
    if (!id) return NextResponse.json({ error: 'Agenda ontbreekt' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const org = await getOrCreateSalesOrg()

    // Enkel een agenda van onszelf; een id van buiten mag hier niets uithalen.
    const { data: own } = await admin.from('sales_calendar_connections')
      .select('id').eq('id', id).eq('sales_client_id', org.id).maybeSingle()
    if (!own) return NextResponse.json({ error: 'Agenda niet gevonden' }, { status: 404 })

    const name = String(b.name ?? '').trim().slice(0, 60)
    if (!name) return NextResponse.json({ error: 'Vul een naam in' }, { status: 400 })

    // Handtekening: ofwel een sleutel uit onze eigen lijst, ofwel niets. Een
    // vrije URL laten we bewust niet toe — die zou zomaar in klantmails komen.
    const sig = SIGNATURES.find((s) => s.key === String(b.signature ?? ''))
    const payload: Record<string, unknown> = {
      name,
      signature_image_url: sig?.url ?? null,
      signature_phone: String(b.phone ?? '').trim() || sig?.phone || null,
      signature_email: String(b.email ?? '').trim() || sig?.email || null,
    }

    let { error } = await admin.from('sales_calendar_connections').update(payload).eq('id', id)
    if (error && /signature_|PGRST204|schema cache/i.test(error.message)) {
      // Kolommen bestaan nog niet → op zijn minst de naam bewaren.
      ;({ error } = await admin.from('sales_calendar_connections').update({ name }).eq('id', id))
      if (!error) {
        return NextResponse.json({
          ok: true,
          warning: 'De naam is opgeslagen, maar de handtekening niet: draai eerst de migratie.',
        })
      }
    }
    if (error) throw new Error(error.message)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
