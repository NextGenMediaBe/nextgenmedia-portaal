import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/supabase/server'
import { runAndSendAdminReport } from '@/lib/admin-report'

// Admin vraagt manueel een rapportmail op. Verstuurt ALTIJD (ook zonder wijzigingen).
export async function POST() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const res = await runAndSendAdminReport('manual')
    if (!res.sent) return NextResponse.json({ error: res.error || 'Verzenden mislukt' }, { status: 400 })
    return NextResponse.json({ ok: true, itemCount: res.itemCount })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
