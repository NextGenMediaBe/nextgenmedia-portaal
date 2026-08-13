'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, X, Phone, Mail, Globe, SkipForward, CheckCircle2 } from 'lucide-react'
import { FOCUS_ACTIONS, stageLabel } from '@/lib/sales/stages'

type Lead = {
  id: string; stage_key: string; do_not_call: boolean
  sales_companies: { name: string; website: string | null; sector: string | null; city: string | null; phone: string | null } | null
  sales_contacts: { name: string | null; email: string | null; phone: string | null; mobile: string | null; role: string | null } | null
}

/**
 * Focus Mode (§4): één lead per keer, volledig scherm, sneltoetsen 1–6.
 * Elke keuze zet de fase, logt de belpoging en springt naar de volgende lead.
 * Leads met "niet bellen" worden overgeslagen.
 */
export function FocusMode({ leads, clientId, onClose, onChanged }: {
  leads: Lead[]; clientId: string; onClose: () => void; onChanged: () => void
}) {
  const router = useRouter()
  // Filter meteen bij het openen: niet-bellen komt hier nooit voorbij.
  const queue = useMemo(() => leads.filter((l) => !l.do_not_call), [leads])
  const [i, setI] = useState(0)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const lead = queue[i]
  const phone = lead?.sales_contacts?.phone || lead?.sales_contacts?.mobile || lead?.sales_companies?.phone || ''

  const next = useCallback(() => {
    setNote('')
    setI((x) => x + 1)
  }, [])

  const apply = useCallback(async (actionKey: string) => {
    if (!lead || busy) return
    const action = FOCUS_ACTIONS.find((a) => a.key === actionKey)
    if (!action) return

    // "Afspraak boeken" wisselt geen fase: de kalender doet dat na een échte
    // boeking (§3). We springen er gewoon heen met de lead vooringevuld.
    if (action.opensBooking) {
      router.push(`/admin/sales/appointments?client=${clientId}&lead=${lead.id}`)
      return
    }

    setBusy(true)
    try {
      const body: Record<string, unknown> = { noteKind: 'call', note: note.trim() || action.label }
      if (action.stage && action.stage !== lead.stage_key) body.stage = action.stage
      const res = await fetch(`/api/admin/sales/leads/${lead.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      onChanged()
      next()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt') } finally { setBusy(false) }
  }, [lead, busy, note, clientId, router, onChanged, next])

  // Sneltoetsen. Niet actief terwijl je in het notitieveld typt, anders zou een
  // "3" in je notitie de lead op Interesse zetten.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      if (e.key === 'Escape') { onClose(); return }
      if (FOCUS_ACTIONS.some((a) => a.key === e.key)) { e.preventDefault(); void apply(e.key) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [apply, onClose])

  if (!lead) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center p-6">
        <div className="text-center space-y-3">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto" />
          <h2 className="text-xl font-bold">Lijst afgewerkt</h2>
          <p className="text-sm text-gray-600">
            {queue.length === 0 ? 'Er staan geen belbare leads in deze selectie.' : `Je hebt ${queue.length} lead(s) doorlopen.`}
          </p>
          <button onClick={onClose} className="btn-primary">Terug naar de pipeline</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Kop met voortgang */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="text-sm text-gray-600">
          Lead <b className="text-gray-900">{i + 1}</b> van {queue.length}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={next} className="btn-secondary text-sm"><SkipForward className="h-4 w-4" />Overslaan</button>
          <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="h-1 bg-gray-100">
        <div className="h-full bg-[#fff848] transition-all" style={{ width: `${((i) / Math.max(1, queue.length)) * 100}%` }} />
      </div>

      {/* De lead */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">{lead.sales_companies?.name}</h1>
            <p className="text-gray-600 mt-1">
              {[lead.sales_contacts?.name, lead.sales_contacts?.role].filter(Boolean).join(' · ') || 'Geen contactpersoon'}
            </p>
            <p className="text-sm text-gray-500 mt-0.5">
              {[lead.sales_companies?.sector, lead.sales_companies?.city].filter(Boolean).join(' · ')}
              {' · '}<span className="text-gray-400">{stageLabel(lead.stage_key)}</span>
            </p>
          </div>

          {/* Het nummer groot en klikbaar: dit is waar je op belt. */}
          {phone ? (
            <a href={`tel:${phone}`} className="flex items-center gap-3 text-2xl font-semibold text-black hover:underline">
              <Phone className="h-6 w-6 text-gray-400" />{phone}
            </a>
          ) : (
            <p className="text-gray-400 flex items-center gap-2"><Phone className="h-5 w-5" />Geen telefoonnummer</p>
          )}

          <div className="flex gap-3 text-sm">
            {lead.sales_contacts?.email && (
              <a href={`mailto:${lead.sales_contacts.email}`} className="text-gray-600 hover:text-black flex items-center gap-1.5">
                <Mail className="h-4 w-4 text-gray-400" />{lead.sales_contacts.email}
              </a>
            )}
            {lead.sales_companies?.website && (
              <a href={lead.sales_companies.website.startsWith('http') ? lead.sales_companies.website : `https://${lead.sales_companies.website}`}
                target="_blank" rel="noreferrer" className="text-gray-600 hover:text-black flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-gray-400" />website
              </a>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notitie bij deze belpoging</label>
            <textarea rows={3} className="input-base" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Wat is er gezegd? (leeg = alleen de gekozen uitkomst)" />
            <p className="text-[11px] text-gray-500 mt-1">Sneltoetsen werken niet terwijl je hier typt — klik eerst buiten het veld.</p>
          </div>
        </div>
      </div>

      {/* Uitkomsten met sneltoetsen */}
      <div className="border-t border-gray-100 px-5 py-4">
        <div className="max-w-2xl mx-auto grid grid-cols-2 sm:grid-cols-3 gap-2">
          {FOCUS_ACTIONS.map((a) => (
            <button key={a.key} onClick={() => apply(a.key)} disabled={busy}
              className={`text-sm px-3 py-2.5 rounded-lg border text-left transition-colors ${
                a.opensBooking ? 'border-[#fff848] bg-[#fff848]/20 hover:bg-[#fff848]/40' : 'border-gray-200 hover:bg-gray-50'
              }`}>
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-gray-900 text-white text-[11px] font-bold mr-2">{a.key}</span>
              {a.label}
            </button>
          ))}
        </div>
        {busy && <div className="text-center mt-2"><Loader2 className="h-4 w-4 animate-spin mx-auto text-gray-400" /></div>}
      </div>
    </div>
  )
}
