import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildNotifications } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (data?.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const notifications = await buildNotifications()
    return NextResponse.json({ notifications })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
