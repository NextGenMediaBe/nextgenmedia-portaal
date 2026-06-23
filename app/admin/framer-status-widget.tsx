import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { validateFramerConfig } from '@/lib/framer'
import { Plug, ArrowRight } from 'lucide-react'

export async function FramerStatusWidget() {
  let linked = 0, active = 0, publishedToday = 0, failed = 0, ready = 0
  try {
    const admin = createAdminSupabaseClient()
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0)
    const [{ data: clients }, { data: blogs }, { data: logs }] = await Promise.all([
      admin.from('blog_accounts').select('framer_project_url, framer_api_key, framer_blog_collection_id, framer_field_map').eq('active', true),
      admin.from('blogs').select('status'),
      admin.from('framer_logs').select('actie, status, created_at').gte('created_at', startToday.toISOString()),
    ])
    for (const c of (clients ?? []) as Array<{ framer_project_url: string | null; framer_api_key: string | null; framer_blog_collection_id: string | null; framer_field_map: unknown }>) {
      if (c.framer_project_url && c.framer_api_key) active++
      if (validateFramerConfig({ projectUrl: c.framer_project_url, apiKeyEncrypted: c.framer_api_key, collectionId: c.framer_blog_collection_id, fieldMap: (c.framer_field_map ?? null) as Record<string, string> | null }).ok) linked++
    }
    const b = (blogs ?? []) as { status: string }[]
    failed = b.filter((x) => x.status === 'gefaald').length
    ready = b.filter((x) => x.status === 'klaar_voor_review' || x.status === 'goedgekeurd').length
    publishedToday = (logs ?? []).filter((l: { actie: string; status: string }) => l.actie === 'publish' && l.status === 'ok').length
  } catch {
    return null // tabellen nog niet aangemaakt → widget verbergen
  }

  if (active === 0 && ready === 0 && failed === 0) return null

  const cells = [
    { label: 'Gekoppelde projecten', value: linked, color: 'text-green-600' },
    { label: 'Actieve projecten', value: active, color: 'text-gray-900' },
    { label: 'Publicaties vandaag', value: publishedToday, color: 'text-blue-600' },
    { label: 'Klaar voor publicatie', value: ready, color: 'text-amber-600' },
    { label: 'Gefaald', value: failed, color: 'text-red-600' },
  ]

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Plug className="h-4 w-4 text-gray-400" />Framer status</h2>
        <Link href="/admin/framer" className="text-xs text-gray-400 hover:text-black flex items-center gap-1">Framer Manager <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {cells.map((c) => (
          <Link key={c.label} href="/admin/framer" className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
            <div className="text-[11px] text-gray-500">{c.label}</div>
            <div className={`mt-0.5 text-xl font-bold ${c.color}`}>{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
