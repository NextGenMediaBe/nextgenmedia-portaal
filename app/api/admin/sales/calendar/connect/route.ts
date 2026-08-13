import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/supabase/server'
import { authUrl, googleConfigured } from '@/lib/sales/google-calendar'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'

// GET ?client=<id> — start de Google-koppeling voor deze klant (§7).
export async function GET(req: NextRequest) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!googleConfigured()) {
      return NextResponse.json({ error: 'Google is nog niet ingesteld (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ontbreken).' }, { status: 400 })
    }
    const client = req.nextUrl.searchParams.get('client') ?? ''
    if (!client) return NextResponse.json({ error: 'client vereist' }, { status: 400 })
    // Naam van de persoon wiens agenda we koppelen (Bram, Marco, ...).
    const name = (req.nextUrl.searchParams.get('name') ?? '').trim()
    return NextResponse.redirect(authUrl(client, randomUUID(), name))
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
