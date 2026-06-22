'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plug, Database, ListChecks, RefreshCw, Save, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

type Row = {
  id: string; company_name: string; connected: boolean; project_url: string | null
  collection_linked: boolean; framer_valid: boolean; last_sync: string | null
  published: number; review: number; approved: number; failed: number; state: 'groen' | 'oranje' | 'rood'
}
type Stats = { linkedProjects: number; activeProjects: number; publishedToday: number; failedTotal: number; failedToday: number; readyToPublish: number }

const STATE_DOT: Record<string, string> = { groen: 'bg-green-500', oranje: 'bg-amber-500', rood: 'bg-red-500' }
const FIELD_KEYS = ['titel', 'content', 'thumbnail', 'excerpt', 'datum', 'slug'] as const

export function FramerManager() {
  const [rows, setRows] = useState<Row[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/framer'); const j = await res.json()
      if (res.ok) { setRows(j.rows ?? []); setStats(j.stats) }
    } catch { /* stil */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Kpi label="Gekoppelde projecten" value={stats.linkedProjects} />
          <Kpi label="Actieve projecten" value={stats.activeProjects} />
          <Kpi label="Publicaties vandaag" value={stats.publishedToday} />
          <Kpi label="Gefaald (totaal)" value={stats.failedTotal} />
          <Kpi label="Klaar voor publicatie" value={stats.readyToPublish} />
          <Kpi label="Gefaald vandaag" value={stats.failedToday} />
        </div>
      )}

      {loading ? (
        <div className="card-base text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : rows.length === 0 ? (
        <div className="card-base empty-state"><Plug className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="text-sm">Nog geen klanten met blogs inbegrepen.</p></div>
      ) : (
        <div className="space-y-3">{rows.map((r) => <ClientCard key={r.id} row={r} onChanged={load} />)}</div>
      )}
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-gray-100 p-3"><div className="text-[11px] text-gray-500">{label}</div><div className="mt-0.5 text-xl font-bold">{value}</div></div>
}

function ClientCard({ row, onChanged }: { row: Row; onChanged: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [collections, setCollections] = useState<{ id: string; name: string }[] | null>(null)
  const [fields, setFields] = useState<{ id: string; name: string; type: string }[] | null>(null)
  const [map, setMap] = useState<Record<string, string>>({})

  const call = async (action: string, extra?: object) => {
    setBusy(action)
    try {
      const res = await fetch('/api/admin/framer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, client_id: row.id, ...extra }) })
      const j = await res.json(); if (!res.ok || j.ok === false) throw new Error(j.error || 'Mislukt')
      return j
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout'); return null } finally { setBusy(null) }
  }

  const saveSettings = async (patch: object, msg: string) => {
    setBusy('save')
    try {
      const res = await fetch('/api/admin/blog-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: row.id, ...patch }) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success(msg); onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }

  const test = async () => { const j = await call('test'); if (j) toast.success(`Framer verbonden — ${j.collections} collectie(s).`) }
  const getCollections = async () => { const j = await call('collections'); if (j) setCollections(j.collections ?? []) }
  const getFields = async () => { const j = await call('fields'); if (j) { setFields(j.fields ?? []); setMap(j.suggested ?? {}) } }

  return (
    <div className="card-base">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${STATE_DOT[row.state]}`} />{row.company_name}
            {row.framer_valid ? <span className="inline-flex items-center gap-1 text-[10px] text-green-700"><CheckCircle2 className="h-3 w-3" />Volledig gekoppeld</span> : <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-3 w-3" />Onvolledig</span>}
          </div>
          <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            <span>Verbonden: {row.connected ? 'ja' : 'nee'}</span>
            <span>Collectie: {row.collection_linked ? 'gekoppeld' : 'nee'}</span>
            <span>Laatste sync: {row.last_sync ? formatDate(row.last_sync) : '—'}</span>
            {row.project_url && <a href={row.project_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">project <ExternalLink className="h-3 w-3" /></a>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
            <span className="status-badge bg-green-100 text-green-700">{row.published} gepubliceerd</span>
            <span className="status-badge bg-amber-100 text-amber-700">{row.review} review</span>
            {row.approved > 0 && <span className="status-badge bg-blue-100 text-blue-700">{row.approved} goedgekeurd</span>}
            {row.failed > 0 && <span className="status-badge bg-red-100 text-red-700">{row.failed} gefaald</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link href={`/admin/blogs?client=${row.id}`} className="btn-secondary text-xs">Review</Link>
          <button onClick={() => setOpen((o) => !o)} className="btn-secondary text-xs">{open ? 'Sluiten' : 'Configureren'}</button>
        </div>
      </div>

      {open && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
          <div className="flex flex-wrap gap-2">
            <button onClick={test} disabled={busy === 'test'} className="btn-secondary text-xs">{busy === 'test' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}Test Framer verbinding</button>
            <button onClick={getCollections} disabled={busy === 'collections'} className="btn-secondary text-xs">{busy === 'collections' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Database className="h-3.5 w-3.5" />}Collecties ophalen</button>
            <button onClick={getFields} disabled={busy === 'fields'} className="btn-secondary text-xs">{busy === 'fields' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListChecks className="h-3.5 w-3.5" />}Velden ophalen</button>
          </div>

          {collections && (
            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
              <div className="text-xs font-medium text-gray-600">Kies CMS-collectie</div>
              {collections.length === 0 ? <p className="text-xs text-gray-400">Geen collecties gevonden.</p> : collections.map((c) => (
                <label key={c.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>{c.name} <span className="text-gray-400 text-xs">({c.id})</span></span>
                  <button onClick={() => saveSettings({ framer_blog_collection_id: c.id }, 'Collectie gekoppeld.')} disabled={busy === 'save'} className="btn-secondary text-xs"><Save className="h-3.5 w-3.5" />Koppelen</button>
                </label>
              ))}
            </div>
          )}

          {fields && (
            <div className="rounded-xl border border-gray-100 p-3 space-y-2">
              <div className="text-xs font-medium text-gray-600">Field map (suggesties automatisch ingevuld)</div>
              {FIELD_KEYS.map((k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className="w-24 text-xs text-gray-500">{k}</span>
                  <select value={map[k] ?? ''} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value }))} className="flex-1 rounded-lg border border-gray-200 px-2 py-1 text-xs">
                    <option value="">— geen —</option>
                    {fields.map((f) => <option key={f.id} value={f.id}>{f.name || f.id} ({f.type})</option>)}
                  </select>
                </div>
              ))}
              <button onClick={() => saveSettings({ framer_field_map: Object.fromEntries(Object.entries(map).filter(([, v]) => v)) }, 'Field map opgeslagen.')} disabled={busy === 'save'} className="btn-primary text-xs"><Save className="h-3.5 w-3.5" />Field map opslaan</button>
            </div>
          )}

          <p className="text-[11px] text-gray-400">Per klant: eigen project URL, API key, collectie en field map. API key beheer je in de klantdetailpagina → Blogs. Publicatie staat achter FRAMER_ENABLED tot je het op één klant test.</p>
        </div>
      )}
    </div>
  )
}
