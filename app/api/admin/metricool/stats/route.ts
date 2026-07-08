import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { metricoolConfigured, fetchAllPostStats, summarizeStats, engagementOf, diagnoseAnalytics } from '@/lib/metricool'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// GET — per-klant statistieken (ADMIN-ONLY). Nooit in het klantportaal.
//   ?clientId=<uuid>&days=90        → geaggregeerde samenvatting + top posts
//   ?clientId=<uuid>&diag=1         → ruwe analytics-respons (veldnamen bevestigen)
export async function GET(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!metricoolConfigured()) return NextResponse.json({ configured: false })

    const sp = req.nextUrl.searchParams
    const clientId = sp.get('clientId')
    if (!clientId) return NextResponse.json({ error: 'clientId vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: client } = await admin
      .from('clients').select('id, company_name, metricool_blog_id').eq('id', clientId).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    if (!client.metricool_blog_id) return NextResponse.json({ configured: true, linked: false })

    const blogId = client.metricool_blog_id as string
    const days = Math.min(365, Math.max(7, Number(sp.get('days')) || 90))
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    const start = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10)

    // Diagnose-modus: ruwe respons per stats-endpoint.
    if (sp.get('diag') === '1') {
      const attempts = await diagnoseAnalytics(blogId, start, end)
      return NextResponse.json({ configured: true, linked: true, blogId, start, end, attempts })
    }

    const posts = await fetchAllPostStats(blogId, start, end)
    const summary = summarizeStats(posts)
    const top = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 12)
      .map((p) => ({ ...p, engagement: engagementOf(p) }))

    return NextResponse.json({
      configured: true, linked: true,
      clientName: client.company_name, start, end, days,
      summary, top,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
