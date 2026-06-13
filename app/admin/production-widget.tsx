import Link from 'next/link'
import { FileText, Camera, Scissors, MessageSquareWarning, BarChart3, ArrowRight } from 'lucide-react'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { loadProduction, defaultBatchFor } from '@/lib/production-data'
import { isProductionMonth } from '@/lib/production'

export async function ProductionThisMonth() {
  const now = new Date()
  const month = now.getMonth()

  let feedbackCount = 0
  try {
    const admin = createAdminSupabaseClient()
    const { count } = await admin.from('social_content_items').select('id', { count: 'exact', head: true }).eq('status', 'changes_requested')
    feedbackCount = count ?? 0
  } catch { /* no service key */ }

  const { clients, batches } = await loadProduction(now)
  const inProduction = clients.filter((c) => { const b = defaultBatchFor(c, batches); return b && isProductionMonth(b, month) })

  const cells: { label: string; value: number; Icon: React.ElementType; color: string }[] = [
    { label: 'Scripts schrijven', value: inProduction.length, Icon: FileText, color: 'text-amber-600' },
    { label: 'Shoots', value: inProduction.length, Icon: Camera, color: 'text-purple-600' },
    { label: 'Editen', value: inProduction.length, Icon: Scissors, color: 'text-blue-600' },
    { label: 'Feedback', value: feedbackCount, Icon: MessageSquareWarning, color: 'text-red-600' },
    { label: 'Rapportering', value: clients.length, Icon: BarChart3, color: 'text-green-600' },
  ]

  return (
    <div className="card-base">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">Deze maand — productie</h3>
        <Link href="/admin/productie" className="flex items-center gap-1 text-xs text-gray-400 hover:text-black">Productieplanning <ArrowRight className="h-3 w-3" /></Link>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {cells.map((c) => (
          <Link key={c.label} href="/admin/productie" className="rounded-xl border border-gray-100 p-3 transition-colors hover:bg-gray-50">
            <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><c.Icon className={`h-3.5 w-3.5 ${c.color}`} />{c.label}</div>
            <div className={`mt-1 text-xl font-bold ${c.color}`}>{c.value}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
