import { NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { metricoolConfigured, listBrands } from '@/lib/metricool'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// GET — alle Metricool-merken + de huidige app-klant-koppelingen (voor het koppelscherm).
export async function GET() {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!metricoolConfigured()) {
      return NextResponse.json({ configured: false, brands: [], clients: [] })
    }
    const admin = createAdminSupabaseClient()
    const [{ data: clients }, brands] = await Promise.all([
      admin.from('clients').select('id, company_name, metricool_blog_id, metricool_brand_name')
        .order('company_name', { ascending: true }),
      listBrands(),
    ])
    return NextResponse.json({ configured: true, brands, clients: clients ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
