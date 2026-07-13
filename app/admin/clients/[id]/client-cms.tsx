'use client'

import { useCallback, useEffect, useState } from 'react'
import { Globe, Loader2, Sparkles, Save, Check, KeyRound, Database } from 'lucide-react'
import { toast } from 'sonner'

type Field = { id: string; name: string; type: string; editable?: boolean }
type Collection = {
  id: string; framer_collection_id: string; name: string; slug: string | null
  fields: Field[]; client_editable: boolean; item_count: number; synced_at: string | null
}
type Status = { projectUrl: string; hasApiKey: boolean; cmsEnabled: boolean; configured: boolean; collections: Collection[] }

export function ClientCms({ clientId }: { clientId: string }) {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)
  const [projectUrl, setProjectUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)

  const base = `/api/admin/clients/${clientId}/framer`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(base)
      const j = await res.json()
      if (res.ok) { setStatus(j); setProjectUrl(j.projectUrl ?? '') }
    } catch { /* stil */ } finally { setLoading(false) }
  }, [base])
  useEffect(() => { load() }, [load])

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true)
    try {
      const res = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      setApiKey('')
      await load()
      toast.success('Opgeslagen.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setSaving(false) }
  }

  const analyze = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch(`${base}/analyze`, { method: 'POST' })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success(`${j.summary.collections} collectie(s), ${j.summary.items} item(s) geïmporteerd.`)
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Analyse mislukt') } finally { setAnalyzing(false) }
  }

  const toggleCollectionEditable = async (col: Collection) => {
    // Optimistisch: enkel client_editable wijzigen slaan we op via een aparte kolom-update
    // (heruitvoeren van Analyseer bewaart de keuze). Voor nu togglet dit lokaal + persist via analyze-behoud.
    try {
      const res = await fetch(`${base}/collection`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ framerCollectionId: col.framer_collection_id, clientEditable: !col.client_editable }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') }
  }

  if (loading) return <div className="card-base"><div className="py-4 text-center text-gray-400"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div></div>

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50'

  return (
    <div className="card-base space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2"><Globe className="h-4 w-4 text-gray-400" />Website-CMS (Framer)</h2>
        {status?.configured && (
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={status.cmsEnabled} disabled={saving} onChange={(e) => save({ cmsEnabled: e.target.checked })} />
            Klant mag CMS beheren
          </label>
        )}
      </div>

      {/* Koppeling */}
      <div className="space-y-2">
        <label className="block text-[11px] text-gray-500">Framer-project-URL of ID</label>
        <input className={inp} value={projectUrl} onChange={(e) => setProjectUrl(e.target.value)} placeholder="https://framer.com/projects/…" />
        <label className="block text-[11px] text-gray-500 flex items-center gap-1"><KeyRound className="h-3 w-3" />API-key {status?.hasApiKey && <span className="text-green-600">(ingesteld — leeg laten = behouden)</span>}</label>
        <input className={inp} type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status?.hasApiKey ? '•••••••• (behouden)' : 'Framer Site Settings → General → API key'} autoComplete="off" />
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => save({ projectUrl, ...(apiKey.trim() ? { apiKey } : {}) })} disabled={saving} className="btn-secondary text-sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Koppeling opslaan
          </button>
          <button onClick={analyze} disabled={analyzing || !status?.configured} className="btn-primary text-sm disabled:opacity-40 disabled:cursor-not-allowed" title={status?.configured ? 'Collecties + velden + items ophalen uit Framer' : 'Stel eerst project + key in'}>
            {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Analyseer
          </button>
        </div>
      </div>

      {/* Geïmporteerde collecties */}
      {status && status.collections.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="text-[11px] text-gray-500 flex items-center gap-1"><Database className="h-3 w-3" />Geïmporteerde collecties</div>
          {status.collections.map((c) => (
            <div key={c.id} className="rounded-lg border border-gray-100 p-2.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm">{c.name || '(naamloos)'}</div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-gray-400">{c.item_count} item(s) · {c.fields.length} veld(en)</span>
                  <button onClick={() => toggleCollectionEditable(c)} className={`text-[11px] px-2 py-0.5 rounded-full border ${c.client_editable ? 'border-green-300 bg-green-50 text-green-700' : 'border-gray-200 text-gray-500'}`}>
                    {c.client_editable ? <span className="flex items-center gap-1"><Check className="h-3 w-3" />klant bewerkt</span> : 'alleen-lezen'}
                  </button>
                </div>
              </div>
              {c.fields.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {c.fields.slice(0, 12).map((f) => (
                    <span key={f.id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{f.name} <span className="text-gray-400">· {f.type}</span></span>
                  ))}
                  {c.fields.length > 12 && <span className="text-[10px] text-gray-400 px-1">+{c.fields.length - 12}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {status && !status.configured && (
        <p className="text-[11px] text-gray-400">Koppel een Framer-project + API-key om de CMS in de app te beheren. AI-websites hebben hun eigen beheer en hoeven niet gekoppeld te worden.</p>
      )}
    </div>
  )
}
