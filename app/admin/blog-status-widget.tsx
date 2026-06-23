import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { Newspaper, ArrowRight } from 'lucide-react'

export async function BlogStatusWidget() {
  let activeClients = 0, review = 0, published = 0, attention = 0, syncProblems = 0, dueToday = 0
  try {
    const admin = createAdminSupabaseClient()
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().slice(0, 10)

    const [{ data: accounts }, { data: blogs }] = await Promise.all([
      admin.from('blog_accounts').select('volgende_generatie_datum').eq('active', true),
      admin.from('blogs').select('status, sync_status'),
    ])
    const cs = (accounts ?? []) as { volgende_generatie_datum: string | null }[]
    activeClients = cs.length
    dueToday = cs.filter((c) => c.volgende_generatie_datum && c.volgende_generatie_datum <= todayStr).length
    const b = (blogs ?? []) as { status: string; sync_status: string | null }[]
    review = b.filter((x) => x.status === 'klaar_voor_review').length
    published = b.filter((x) => x.status === 'gepubliceerd').length
    attention = b.filter((x) => x.status === 'gefaald').length
    syncProblems = b.filter((x) => x.sync_status === 'failed' || x.sync_status === 'pending').length
  } catch {
    return null // blog-tabellen nog niet aangemaakt → widget verbergen
  }

  if (activeClients === 0 && review === 0 && published === 0) return null

  const cells = [
    { label: 'Actieve blogaccounts', value: activeClients, color: 'text-gray-900' },
    { label: 'In review', value: review, color: 'text-amber-600' },
    { label: 'Gepubliceerd', value: published, color: 'text-green-600' },
    { label: 'Aandacht nodig', value: attention, color: 'text-red-600' },
    { label: 'Sync-problemen', value: syncProblems, color: 'text-orange-600' },
    { label: 'Generatie vandaag', value: dueToday, color: 'text-blue-600' },
  ]

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2"><Newspaper className="h-4 w-4 text-gray-400" />Blog Manager</h2>
        <Link href="/admin/blogs" className="text-xs text-gray-400 hover:text-black flex items-center gap-1">Blogs <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {cells.map((c) => (
          <Link key={c.label} href="/admin/blogs" className="rounded-xl border border-gray-100 p-3 hover:bg-gray-50 transition-colors">
            <div className="text-[11px] text-gray-500">{c.label}</div>
            <div className={`mt-0.5 text-xl font-bold ${c.color}`}>{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
