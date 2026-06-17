import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

// Veilige diagnose: toont enkel of de mail-env aanwezig is (nooit de waarden).
export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  const key = process.env.RESEND_API_KEY
  return NextResponse.json({
    hasResendKey: !!key,
    resendKeyLength: key ? key.length : 0,        // alleen de lengte, niet de sleutel
    resendKeyStartsWithRe: key ? key.startsWith('re_') : false,
    emailFrom: process.env.EMAIL_FROM || '(standaard) NextGenMedia <info@nextgenmedia.be>',
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL || '(niet gezet)',
    hasCronSecret: !!process.env.CRON_SECRET,
  })
}
