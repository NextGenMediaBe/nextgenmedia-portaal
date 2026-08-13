import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/supabase/server'
import { loadCalendar } from '@/lib/sales/service'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET ?client=<id>&from=<ms>&to=<ms>
// Geeft de WITTE (boekbare) segmenten + de bestaande afspraken. Het grijs wordt
// in de UI getekend als complement van deze segmenten, zodat wat je ziet en wat
// je mag slepen altijd uit dezelfde berekening komen (§5, §11).
export async function GET(req: NextRequest) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const sp = req.nextUrl.searchParams
    const client = sp.get('client') ?? ''
    const from = Number(sp.get('from'))
    const to = Number(sp.get('to'))
    if (!client || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
      return NextResponse.json({ error: 'client, from en to zijn vereist' }, { status: 400 })
    }
    // Ruim begrensd zodat één verzoek nooit een half jaar aan agenda ophaalt.
    if (to - from > 40 * 86400000) return NextResponse.json({ error: 'Venster te groot' }, { status: 400 })

    const data = await loadCalendar(client, from, to)
    if (!data) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
