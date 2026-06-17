'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2, Loader2, Layers } from 'lucide-react'
import { MONTHS_NL } from '@/lib/lifecycle'
import { DEFAULT_BATCH_COLORS, shootMonth, type Batch } from '@/lib/production'

type ClientRow = { id: string; name: string; batchId: string | null; batchMonth: number | null }

const api = async (method: string, body?: unknown, qs = '') => {
  const res = await fetch(`/api/admin/batches${qs}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || 'Fout')
  return j
}

export function BatchManager({ batches, clients }: { batches: Batch[]; clients: ClientRow[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key); setErr(null)
    try { await fn(); router.refresh() }
    catch (e) { setErr(e instanceof Error ? e.message : 'Fout') }
    finally { setBusy(null) }
  }

  const addBatch = () => run('add', () => api('POST', {
    name: `Batch ${batches.length + 1}`,
    color: DEFAULT_BATCH_COLORS[batches.length % DEFAULT_BATCH_COLORS.length],
    start_month: new Date().getMonth(),
    shoot_offset: 1,
    sort_order: batches.length,
  }))

  const patchBatch = (id: string, patch: Partial<Batch>) => run(`b-${id}`, () => api('PATCH', { id, ...patch }))
  const delBatch = (id: string) => run(`d-${id}`, () => api('DELETE', undefined, `?id=${id}`))
  const assign = (clientId: string, batchId: string | null) => run(`c-${clientId}`, () => api('PATCH', { action: 'assign', client_id: clientId, batch_id: batchId }))

  return (
    <div className="card-base">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900"><Layers className="h-4 w-4" />Batchbeheer</h2>
        <button onClick={addBatch} disabled={busy === 'add'} className="btn-secondary text-xs">
          {busy === 'add' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}Nieuwe batch
        </button>
      </div>

      {err && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</div>}

      {batches.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nog geen batches. Maak er één aan om klanten in te delen.</p>
      ) : (
        <div className="space-y-3">
          {batches.map((b) => {
            const members = clients.filter((c) => c.batchId === b.id)
            return (
              <div key={b.id} className="rounded-xl border border-gray-100 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="color" defaultValue={b.color} onChange={(e) => patchBatch(b.id, { color: e.target.value })} className="h-7 w-7 cursor-pointer rounded border border-gray-200 bg-white p-0.5" title="Kleur" />
                  <input defaultValue={b.name} onBlur={(e) => e.target.value !== b.name && patchBatch(b.id, { name: e.target.value })} className="w-40 rounded-lg border border-gray-200 px-2 py-1 text-sm font-medium" />
                  <label className="flex items-center gap-1 text-xs text-gray-500">Content vanaf
                    <select defaultValue={b.start_month} onChange={(e) => patchBatch(b.id, { start_month: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs">
                      {MONTHS_NL.map((m, i) => <option key={i} value={i}>{m}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-gray-500">Shoot
                    <select defaultValue={b.shoot_offset} onChange={(e) => patchBatch(b.id, { shoot_offset: Number(e.target.value) })} className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs">
                      <option value={0}>zelfde maand</option>
                      <option value={1}>1 maand vóór</option>
                      <option value={2}>2 maanden vóór</option>
                    </select>
                  </label>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">Shootmaand: {MONTHS_NL[shootMonth(b)]}</span>
                  <button onClick={() => delBatch(b.id)} disabled={busy === `d-${b.id}`} className="ml-auto text-gray-300 hover:text-red-500" title="Batch verwijderen">
                    {busy === `d-${b.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
                {members.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {members.map((c) => (
                      <span key={c.id} className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs">
                        <span className="h-2 w-2 rounded-full" style={{ background: b.color }} />{c.name}
                        <button onClick={() => assign(c.id, null)} className="text-gray-300 hover:text-red-500" title="Uit batch halen">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Niet-ingedeelde klanten */}
      <div className="mt-4 border-t border-gray-100 pt-4">
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">Klant indelen / verplaatsen</h3>
        <div className="space-y-1.5">
          {clients.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{c.name}</span>
              <select
                value={c.batchId ?? ''}
                onChange={(e) => assign(c.id, e.target.value || null)}
                disabled={busy === `c-${c.id}`}
                className="rounded-lg border border-gray-200 px-2 py-1 text-xs"
              >
                <option value="">— geen batch —</option>
                {batches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
