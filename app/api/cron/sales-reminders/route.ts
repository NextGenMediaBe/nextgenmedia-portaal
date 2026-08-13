import { NextRequest, NextResponse } from 'next/server'
import { runSalesReminders } from '@/lib/sales/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Dagelijkse herinneringen naar prospects met een afspraak (§8).
// Alleen voor klanten die dit expliciet aan hebben staan. Beveiligd met
// CRON_SECRET, net als de andere crons.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  return req.nextUrl.searchParams.get('key') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })
  const res = await runSalesReminders()
  return NextResponse.json({ ok: true, ...res })
}
