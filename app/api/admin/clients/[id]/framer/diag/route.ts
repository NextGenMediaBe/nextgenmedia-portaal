import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { framerConfigured, diagnoseFramer } from '@/lib/framer-cms'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET — diagnose: ruwe Framer-respons (collecties + velden + 1-2 items) zodat we
// de exacte veldshapes kunnen bevestigen. Admin/staff-only.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()
    const { data: client } = await admin
      .from('clients').select('id, framer_project_url, framer_api_key').eq('id', id).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    if (!framerConfigured(client)) return NextResponse.json({ error: 'Framer nog niet geconfigureerd' }, { status: 400 })

    const result = await diagnoseFramer(client.framer_project_url as string, client.framer_api_key as string)
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
