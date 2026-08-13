import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/supabase/server'
import { exchangeCode } from '@/lib/sales/google-calendar'
import { baseUrl } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Terugkeer vanaf Google. We sturen altijd terug naar de kalender met een
// duidelijke melding — nooit een kale JSON-fout in het gezicht van de gebruiker.
export async function GET(req: NextRequest) {
  const back = (msg: string, client?: string) =>
    NextResponse.redirect(`${baseUrl()}/admin/sales/appointments?${new URLSearchParams({ ...(client ? { client } : {}), cal: msg })}`)

  try {
    if (!(await requireStaff())) return NextResponse.redirect(`${baseUrl()}/login`)
    const sp = req.nextUrl.searchParams
    const state = sp.get('state') ?? ''
    const [salesClientId = '', , rawName = ''] = state.split(':')
    const name = decodeURIComponent(rawName || '')
    if (sp.get('error')) return back('geweigerd', salesClientId)
    const code = sp.get('code') ?? ''
    if (!code || !salesClientId) return back('mislukt', salesClientId)

    await exchangeCode(salesClientId, code, name)
    return back('gekoppeld', salesClientId)
  } catch {
    return back('mislukt')
  }
}
