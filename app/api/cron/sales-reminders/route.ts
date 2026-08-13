import { NextRequest, NextResponse } from 'next/server'
import { runSalesReminders } from '@/lib/sales/reminders'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Vangnet voor de herinneringsmails (§8).
//
// De mail wordt normaal al bij het BOEKEN ingepland bij Resend, op het exacte
// verzendmoment. Deze cron pikt enkel de afspraken op die verder dan 72 uur
// vooruit geboekt zijn — die konden toen nog niet ingepland worden. Er draait
// dus bewust maar één cron per dag; frequenter kan ook niet op een Vercel
// Hobby-plan. Beveiligd met CRON_SECRET, net als de andere crons.
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
