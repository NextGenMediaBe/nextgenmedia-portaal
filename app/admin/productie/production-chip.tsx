'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CalendarClock, Camera, FileText, Layers } from 'lucide-react'

export type ChipDetail = {
  clientId: string
  name: string
  color: string | null
  batchName: string | null
  contractStatus: string
  contractStatusColor: string
  nextShoot: string | null
  nextReview: string | null
  nextReporting: string | null
}

const fmt = (iso: string | null) => (iso ? new Date(iso + 'T00:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' }) : '—')

export function ProductionChip({ detail }: { detail: ChipDetail }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-block">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium hover:bg-gray-50"
      >
        <span className="h-2 w-2 rounded-full shrink-0" style={{ background: detail.color ?? '#9ca3af' }} />
        {detail.name}
      </button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <span className="absolute left-0 top-full z-20 mt-1 block w-60 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl">
            <span className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-gray-900">{detail.name}</span>
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${detail.contractStatusColor}`}>{detail.contractStatus}</span>
            </span>
            <span className="block space-y-1.5 text-xs text-gray-600">
              <span className="flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-gray-400" />Batch: <b className="text-gray-800">{detail.batchName ?? 'geen'}</b></span>
              <span className="flex items-center gap-2"><Camera className="h-3.5 w-3.5 text-purple-500" />Volgende shoot: <b className="text-gray-800">{fmt(detail.nextShoot)}</b></span>
              <span className="flex items-center gap-2"><CalendarClock className="h-3.5 w-3.5 text-blue-500" />Strategie review: <b className="text-gray-800">{fmt(detail.nextReview)}</b></span>
              <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-amber-500" />Rapportering: <b className="text-gray-800">{fmt(detail.nextReporting)}</b></span>
            </span>
            <Link href={`/admin/clients/${detail.clientId}`} className="mt-2 block text-xs text-blue-600 hover:underline">Klant openen →</Link>
          </span>
        </>
      )}
    </span>
  )
}
