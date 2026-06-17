'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Trash2, Users } from 'lucide-react'
import { PHASES, PHASE_LABEL, PLANNING_TYPES, PLANNING_TYPE_LABEL, type PhaseKey } from '@/lib/month-phases'

export type ClientOpt = {
  id: string
  name: string
  batchColor: string | null
  contractStatus: string
  nextAction: string
}

type Entry = {
  id: string
  client_id: string
  phase: PhaseKey
  planning_type: string | null
  note: string | null
}

const monthLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
}
const shiftMonth = (ym: string, delta: number) => {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }

export function MonthClientPhases({ clients }: { clients: ClientOpt[] }) {
  const [month, setMonth] = useState(thisMonth)
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(false)
  const [addPhase, setAddPhase] = useState<PhaseKey | null>(null)
  const [openChip, setOpenChip] = useState<string | null>(null)
  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/month-planning-clients?month=${month}`)
      const j = await res.json()
      if (res.ok) setEntries((j.entries ?? []) as Entry[])
    } catch { /* stil */ } finally { setLoading(false) }
  }, [month])

  useEffect(() => { setOpenChip(null); load() }, [load])

  const byPhase = (k: PhaseKey) => entries.filter((e) => e.phase === k)

  const remove = async (id: string) => {
    setEntries((e) => e.filter((x) => x.id !== id))
    await fetch(`/api/admin/month-planning-clients?id=${id}`, { method: 'DELETE' })
  }
  const patch = async (id: string, body: Partial<Pick<Entry, 'phase' | 'planning_type' | 'note'>>) => {
    setEntries((e) => e.map((x) => (x.id === id ? { ...x, ...body } as Entry : x)))
    await fetch('/api/admin/month-planning-clients', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" />Klanten per fase</h2>
          <p className="text-xs text-gray-400 mt-0.5">Koppel handmatig klanten aan een fase voor deze maand — inclusief intakes.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth((m) => shiftMonth(m, -1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftMonth(m, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          {month !== thisMonth() && <button onClick={() => setMonth(thisMonth())} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Deze maand</button>}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PHASES.map((p) => {
          const list = byPhase(p.key)
          return (
            <div key={p.key} className="card-base">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${p.dot}`} />
                  <span className="font-medium text-sm">{p.label}</span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{list.length}</span>
                </div>
                <button onClick={() => setAddPhase(p.key)} className="text-xs text-gray-500 hover:text-black inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" />Klant</button>
              </div>
              {list.length === 0 ? (
                <p className="text-xs text-gray-300 py-2">Nog geen klanten in deze fase.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {list.map((e) => {
                    const c = clientById.get(e.client_id)
                    const open = openChip === e.id
                    return (
                      <span key={e.id} className="relative inline-block">
                        <button onClick={() => setOpenChip(open ? null : e.id)} className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium hover:bg-gray-50">
                          {c?.batchColor && <span className="h-2 w-2 rounded-full" style={{ background: c.batchColor }} />}
                          {c?.name ?? 'Klant'}
                          {e.planning_type && e.planning_type !== 'standaard' && <span className="text-[10px] text-gray-400">·{e.planning_type === 'onboarding' ? 'OB' : 'SI'}</span>}
                        </button>
                        {open && (
                          <ChipPopover
                            entry={e}
                            client={c}
                            onClose={() => setOpenChip(null)}
                            onRemove={() => { remove(e.id); setOpenChip(null) }}
                            onPatch={(b) => patch(e.id, b)}
                          />
                        )}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {loading && <p className="text-xs text-gray-400">Laden…</p>}

      {addPhase && (
        <AddDialog
          phase={addPhase}
          month={month}
          clients={clients}
          existingIds={new Set(byPhase(addPhase).map((e) => e.client_id))}
          onClose={() => setAddPhase(null)}
          onAdded={() => { setAddPhase(null); load() }}
        />
      )}
    </div>
  )
}

function ChipPopover({
  entry, client, onClose, onRemove, onPatch,
}: {
  entry: Entry
  client: ClientOpt | undefined
  onClose: () => void
  onRemove: () => void
  onPatch: (b: Partial<Pick<Entry, 'phase' | 'planning_type' | 'note'>>) => void
}) {
  const [note, setNote] = useState(entry.note ?? '')
  return (
    <>
      <span className="fixed inset-0 z-10" onClick={onClose} />
      <span className="absolute left-0 top-full z-20 mt-1 block w-64 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-xl">
        <span className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-gray-900">{client?.name ?? 'Klant'}</span>
          <button onClick={onRemove} className="text-gray-300 hover:text-red-500" title="Uit fase verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
        </span>
        <span className="block space-y-1.5 text-xs text-gray-600">
          <span className="block">Type: <b className="text-gray-800">{PLANNING_TYPE_LABEL[entry.planning_type ?? 'standaard'] ?? 'Standaard'}</b></span>
          <span className="block">Contract: <b className="text-gray-800">{client?.contractStatus ?? '—'}</b></span>
          <span className="block">Volgende actie: <b className="text-gray-800">{client?.nextAction ?? '—'}</b></span>
        </span>
        <label className="mt-2 block text-[11px] text-gray-500">Verplaatsen naar fase
          <select value={entry.phase} onChange={(e) => onPatch({ phase: e.target.value as PhaseKey })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs">
            {PHASES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </label>
        <label className="mt-2 block text-[11px] text-gray-500">Type
          <select value={entry.planning_type ?? 'standaard'} onChange={(e) => onPatch({ planning_type: e.target.value })} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs">
            {PLANNING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <label className="mt-2 block text-[11px] text-gray-500">Notitie
          <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (entry.note ?? '') && onPatch({ note })} rows={2} className="mt-0.5 w-full rounded-lg border border-gray-200 px-2 py-1 text-xs" placeholder="Optioneel…" />
        </label>
      </span>
    </>
  )
}

function AddDialog({
  phase, month, clients, existingIds, onClose, onAdded,
}: {
  phase: PhaseKey
  month: string
  clients: ClientOpt[]
  existingIds: Set<string>
  onClose: () => void
  onAdded: () => void
}) {
  const defaultType = phase === 'intake_onboarding' ? 'onboarding' : phase === 'strategie_intake' ? 'strategie' : 'standaard'
  const [clientId, setClientId] = useState('')
  const [type, setType] = useState(defaultType)
  const [note, setNote] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const available = clients.filter((c) => !existingIds.has(c.id))

  const submit = async () => {
    if (!clientId) { setError('Kies een klant'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/month-planning-clients', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan_month: month, client_id: clientId, phase, planning_type: type, note: note || null }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      onAdded()
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setLoading(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold">Klant toevoegen</h3>
            <p className="text-xs text-gray-500 mt-0.5">{PHASE_LABEL[phase]}</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Klant</label>
            <select className={inp} value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Kies klant —</option>
              {available.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
            <select className={inp} value={type} onChange={(e) => setType(e.target.value)}>
              {PLANNING_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notitie (optioneel)</label>
            <textarea rows={2} className={inp} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={loading} className="btn-primary flex-1 justify-center">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Toevoegen</button>
            <button onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
