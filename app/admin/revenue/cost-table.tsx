'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2, Repeat2, ArrowDownRight } from 'lucide-react'
import { formatEuro, formatDate } from '@/lib/utils'

export type Cost = {
  id: string
  name: string | null
  category: string | null
  type: 'one_time' | 'recurring'
  cost_date: string | null
  start_date: string | null
  end_date: string | null
  billing_frequency: string | null
  amount_excl: number
  vat_pct: number
}

const FREQ_LABEL: Record<string, string> = { monthly: 'maandelijks', quarterly: 'per kwartaal', annual: 'jaarlijks' }

/**
 * De kostenlijst.
 *
 * `setterCostFY` is geen ingevoerde kostenpost maar een berekend bedrag (uren en
 * commissie van de appointment setters). Het staat hier bewust wél in de lijst —
 * anders tel je de tabel op en kom je niet aan het totaal dat er bovenaan staat.
 * Zonder knoppen, want er valt niets te wijzigen of te verwijderen.
 */
export function CostTable({ costs, setterCostFY = 0, year }: {
  costs: Cost[]; setterCostFY?: number; year?: number
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const remove = async (id: string) => {
    if (!confirm('Deze kost verwijderen?')) return
    setBusy(id)
    try {
      const res = await fetch('/api/admin/costs', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
      if (res.ok) router.refresh()
    } finally { setBusy(null) }
  }

  if (costs.length === 0 && setterCostFY <= 0) {
    return (
      <div className="card-base">
        <h2 className="font-semibold mb-2">Alle kosten</h2>
        <p className="text-sm text-gray-400 text-center py-8">Nog geen kosten geregistreerd</p>
      </div>
    )
  }

  const setterRow = setterCostFY > 0 ? (
    <tr className="border-b border-gray-50 bg-gray-50/60">
      <td className="py-2.5">
        <div className="font-medium">Appointment setters</div>
        <div className="text-[11px] text-gray-500">Automatisch — gelogde uren en toegekende commissies</div>
      </td>
      <td className="py-2.5 text-gray-600">Appointment setters</td>
      <td className="py-2.5 text-gray-600">Doorlopend{year ? ` · ${year}` : ''}</td>
      <td className="py-2.5 text-right tabular">{formatEuro(setterCostFY)}</td>
      <td className="py-2.5 text-right text-gray-400">—</td>
      <td className="py-2.5 text-right tabular">{formatEuro(setterCostFY)}</td>
      <td className="py-2.5 text-right">
        <span className="text-[11px] text-gray-400">berekend</span>
      </td>
    </tr>
  ) : null

  return (
    <div className="card-base">
      <h2 className="font-semibold mb-4">Alle kosten</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Naam</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Categorie</th>
              <th className="text-left py-2 text-xs text-gray-500 font-medium">Type / Periode</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Excl. btw</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">BTW</th>
              <th className="text-right py-2 text-xs text-gray-500 font-medium">Incl. btw</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {setterRow}
            {costs.map((c) => {
              const incl = Number(c.amount_excl) * (1 + Number(c.vat_pct) / 100)
              const period = c.type === 'recurring'
                ? `${formatDate(c.start_date)}${c.end_date ? ' → ' + formatDate(c.end_date) : ' → doorlopend'} · ${FREQ_LABEL[c.billing_frequency ?? 'monthly']}`
                : formatDate(c.cost_date)
              return (
                <tr key={c.id} className="hover:bg-gray-50/50">
                  <td className="py-2.5 font-medium">{c.name ?? '—'}</td>
                  <td className="py-2.5 text-gray-500">{c.category ?? '—'}</td>
                  <td className="py-2.5 text-gray-500 text-xs">
                    <span className="inline-flex items-center gap-1">
                      {c.type === 'recurring' ? <Repeat2 className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {period}
                    </span>
                  </td>
                  <td className="py-2.5 text-right">{formatEuro(Number(c.amount_excl))}</td>
                  <td className="py-2.5 text-right text-gray-400">{Number(c.vat_pct)}%</td>
                  <td className="py-2.5 text-right text-gray-600">{formatEuro(incl)}</td>
                  <td className="py-2.5 text-right">
                    <button onClick={() => remove(c.id)} disabled={busy === c.id} className="text-red-400 hover:text-red-600" title="Verwijderen">
                      {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
