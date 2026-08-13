'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, Link2, Save, UserRound } from 'lucide-react'
import { SIGNATURES, matchSignature } from '@/lib/sales/signatures'

type Existing = {
  id: string
  name: string | null
  signature_image_url?: string | null
  signature_phone?: string | null
  signature_email?: string | null
}

/**
 * Agenda koppelen of bewerken: van wie is deze agenda, en welke handtekening
 * hoort onder de mails die eruit vertrekken.
 *
 * Bij een nieuwe koppeling reizen naam en handtekening mee naar Google en komen
 * ze terug in de callback, zodat alles meteen goed staat na één keer inloggen.
 */
export function AgendaDialog({ existing, onClose, onSaved }: {
  existing?: Existing | null
  onClose: () => void
  onSaved?: () => void
}) {
  const initialSig = existing
    ? SIGNATURES.find((s) => s.url === existing.signature_image_url)?.key
      ?? matchSignature(existing.name)?.key ?? ''
    : ''

  const [name, setName] = useState(existing?.name ?? '')
  const [sigKey, setSigKey] = useState(initialSig)
  const [saving, setSaving] = useState(false)

  // Nog niets gekozen? Dan tonen we alvast de handtekening die bij de naam past.
  const effectiveKey = sigKey || matchSignature(name)?.key || ''
  const sig = SIGNATURES.find((s) => s.key === effectiveKey) ?? null

  const connect = () => {
    if (!name.trim()) { toast.error('Vul in van wie deze agenda is'); return }
    setSaving(true)
    const p = new URLSearchParams({ name: name.trim(), signature: effectiveKey })
    window.location.href = `/api/admin/sales/calendar/connect?${p}`
  }

  const save = async () => {
    if (!existing) return
    if (!name.trim()) { toast.error('Vul een naam in'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/admin/sales/calendar/agenda', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: existing.id, name: name.trim(), signature: effectiveKey }),
      })
      const j = await r.json(); if (!r.ok) throw new Error(j.error)
      if (j.warning) toast.warning(j.warning)
      else toast.success('Opgeslagen.')
      onSaved?.()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <UserRound className="h-4 w-4 text-gray-400" />
              {existing ? 'Agenda bewerken' : 'Agenda koppelen'}
            </h3>
            <p className="text-sm text-gray-600 mt-0.5">
              {existing
                ? 'Van wie is deze agenda, en welke handtekening hoort onder de mails?'
                : 'Vul dit in vóór je inlogt bij Google — dan staat alles meteen goed.'}
            </p>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Van wie is deze agenda?</label>
            <input className="input-base" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Bram" autoFocus />
            <p className="text-[11px] text-gray-500 mt-1">
              Deze naam staat bij de agendakiezer en onder “Met vriendelijke groeten”.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Handtekening in de mail</label>
            <select className="input-base" value={effectiveKey} onChange={(e) => setSigKey(e.target.value)}>
              <option value="">Geen handtekening</option>
              {SIGNATURES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {!sigKey && sig && (
              <p className="text-[11px] text-gray-500 mt-1">Automatisch gekozen op basis van de naam.</p>
            )}
          </div>

          {/* Meteen tonen wat de prospect straks ziet. */}
          {sig ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
              <div className="text-[11px] text-gray-500 mb-2">Zo komt het onderaan de mail:</div>
              <div className="text-sm text-gray-800">Met vriendelijke groeten</div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={sig.url} alt={sig.label} className="mt-2 w-full max-w-[320px] rounded border border-gray-200" />
            </div>
          ) : (
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Zonder handtekening eindigt de mail op “Met vriendelijke groeten”, zonder afbeelding eronder.
            </p>
          )}
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2">
          {existing ? (
            <button onClick={save} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Opslaan
            </button>
          ) : (
            <button onClick={connect} disabled={saving} className="btn-primary flex-1">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Inloggen bij Google
            </button>
          )}
          <button onClick={onClose} className="btn-secondary">Annuleer</button>
        </div>
      </div>
    </div>
  )
}
