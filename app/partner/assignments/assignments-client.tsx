'use client'

import { useState } from 'react'
import { formatEuro, formatDate, SERVICE_LABELS } from '@/lib/utils'
import { Briefcase, CheckCircle2, ChevronDown } from 'lucide-react'

type Assignment = {
  id: string
  title: string
  description: string | null
  status: string
  budget: number | null
  payout: number | null
  deadline: string | null
  created_at: string
  service_slug: string | null
  client_name: string | null
}

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Openstaand', in_progress: 'Actief', completed: 'Afgerond', cancelled: 'Geannuleerd',
}

const FILTERS = ['all', 'open', 'in_progress', 'completed', 'cancelled'] as const

export function PartnerAssignmentsClient({
  partnerId,
  initialAssignments,
}: {
  partnerId: string
  initialAssignments: Assignment[]
}) {
  const [assignments, setAssignments] = useState(initialAssignments)
  const [filter, setFilter] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState<string | null>(null)

  const filtered = filter === 'all' ? assignments : assignments.filter((a) => a.status === filter)

  const updateStatus = async (id: string, status: string) => {
    setLoading(id)
    try {
      const res = await fetch('/api/partner/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      if (!res.ok) {
        const j = await res.json()
        throw new Error(j.error)
      }
      setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* Filter tabs */}
      <div className="flex gap-1 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-300'
            }`}
          >
            {f === 'all' ? 'Alle' : STATUS_LABEL[f]}
            {f !== 'all' && (
              <span className="ml-1.5 opacity-60">{assignments.filter((a) => a.status === f).length}</span>
            )}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card-base text-center py-14 text-gray-400">
          <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Geen opdrachten gevonden</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => (
            <div key={a.id} className="card-base">
              <div
                className="flex items-start justify-between gap-3 cursor-pointer"
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{a.title}</span>
                    {a.service_slug && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        {SERVICE_LABELS[a.service_slug] ?? a.service_slug}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                    {a.client_name && (
                      <span className="text-xs text-gray-400">{a.client_name}</span>
                    )}
                    {a.deadline && (
                      <span className="text-xs text-gray-400">Deadline: {formatDate(a.deadline)}</span>
                    )}
                    <span className="text-xs text-gray-400">{formatDate(a.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {a.payout != null && (
                    <span className="text-sm font-bold">{formatEuro(a.payout)}</span>
                  )}
                  <span className={`status-badge ${STATUS_STYLE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[a.status] ?? a.status}
                  </span>
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded === a.id ? 'rotate-180' : ''}`} />
                </div>
              </div>

              {expanded === a.id && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  {a.description && (
                    <p className="text-sm text-gray-600 whitespace-pre-line">{a.description}</p>
                  )}
                  <div className="flex items-center gap-4 text-sm">
                    {a.budget != null && (
                      <span className="text-gray-500">Budget: <span className="font-medium text-gray-900">{formatEuro(a.budget)}</span></span>
                    )}
                    {a.payout != null && (
                      <span className="text-gray-500">Uitbetaling: <span className="font-medium text-gray-900">{formatEuro(a.payout)}</span></span>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex gap-2 flex-wrap">
                    {a.status === 'open' && (
                      <button
                        onClick={() => updateStatus(a.id, 'in_progress')}
                        disabled={loading === a.id}
                        className="btn-primary text-xs py-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Accepteren
                      </button>
                    )}
                    {a.status === 'in_progress' && (
                      <button
                        onClick={() => updateStatus(a.id, 'completed')}
                        disabled={loading === a.id}
                        className="btn-primary text-xs py-1.5"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Markeer als afgerond
                      </button>
                    )}
                    {(a.status === 'open' || a.status === 'in_progress') && (
                      <button
                        onClick={() => updateStatus(a.id, 'cancelled')}
                        disabled={loading === a.id}
                        className="btn-secondary text-xs py-1.5 text-red-500 hover:bg-red-50"
                      >
                        Afwijzen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
