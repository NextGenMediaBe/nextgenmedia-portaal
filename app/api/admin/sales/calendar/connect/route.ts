import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/supabase/server'
import { authUrl, googleConfigured } from '@/lib/sales/google-calendar'
import { getOrCreateSalesOrg } from '@/lib/sales/service'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// GET ?name=<persoon> — start de Google-koppeling voor die persoon (§7).
export async function GET(req: NextRequest) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!googleConfigured()) {
      return NextResponse.json({ error: 'Google is nog niet ingesteld (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ontbreken).' }, { status: 400 })
    }
    // Naam van de persoon wiens agenda we koppelen (Bram, Marco, ...).
    const name = (req.nextUrl.searchParams.get('name') ?? '').trim()
    const pipeline = await getOrCreateSalesOrg()
    return NextResponse.redirect(authUrl(pipeline.id, randomUUID(), name))
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
