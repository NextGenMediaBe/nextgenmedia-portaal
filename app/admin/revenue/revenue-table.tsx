'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, Repeat2, ArrowUpRight } from 'lucide-react'
import { formatEuro, SERVICE_LABELS } from '@/lib/utils'

interface EntryRow {
  id: string
  title: string | null
  company_name: string
  service_slug: string | null
  type: 'recurring' | 'one_time'
  billing_frequency: string | null
  amount_per_month: number | null
  start_month: string | null
  end_month: string | null
  amount: number | null
  transaction_month: string | null
  notes: string | null
}

const FREQ_SUFFIX: Record<string, string> = {
  monthly: '/m', quarterly: '/kwartaal', 'semi-annual': '/half jaar', annual: '/jaar',
}

function fmtMonth(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
}

export function RevenueTable({ entries }: { entries: EntryRow[] }) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const handleDelete = async (id: string) => {
    if (!confirm('Deze omzet-entry verwijderen?')) return
    setDeletingId(id)
    try {
      await fetch('/api/admin/revenue', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      router.refresh()
    } finally {
      setDeletingId(null)
    }
  }

  if (entries.length === 0) return null

  return (
    <div className="card-base">
      <h2 className="font-semibold mb-4">Alle entries</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Type</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Titel</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Klant</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Dienst</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Periode</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Bedrag</th>
              <th className="py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {entries.map((e) => (
              <tr key={e.id} className="hover:bg-gray-50">
                <td className="py-2.5">
                  {e.type === 'recurring' ? (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                      <Repeat2 className="h-3 w-3" />
                      Recurring
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      <ArrowUpRight className="h-3 w-3" />
                      Eenmalig
                    </span>
                  )}
                </td>
                <td className="py-2.5 font-medium max-w-[180px] truncate">
                  {e.title || '—'}
                  {e.notes && <div className="text-xs text-gray-400 truncate">{e.notes}</div>}
                </td>
                <td className="py-2.5 text-gray-700">{e.company_name}</td>
                <td className="py-2.5 text-gray-500">
                  {e.service_slug ? (SERVICE_LABELS[e.service_slug] ?? e.service_slug) : '—'}
                </td>
                <td className="py-2.5 text-gray-500 text-xs">
                  {e.type === 'recurring' ? (
                    <span>
                      {fmtMonth(e.start_month)}
                      {e.end_month ? ` → ${fmtMonth(e.end_month)}` : ' (doorlopend)'}
                    </span>
                  ) : (
                    fmtMonth(e.transaction_month)
                  )}
                </td>
                <td className="py-2.5 text-right font-semibold">
                  {e.type === 'recurring' ? (
                    <span>
                      {formatEuro(e.amount_per_month)}
                      <span className="text-xs text-gray-400 font-normal">
                        {FREQ_SUFFIX[e.billing_frequency ?? 'monthly'] ?? '/m'}
                      </span>
                    </span>
                  ) : formatEuro(e.amount)}
                </td>
                <td className="py-2.5 text-right">
                  <button
                    onClick={() => handleDelete(e.id)}
                    disabled={deletingId === e.id}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    {deletingId === e.id
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
