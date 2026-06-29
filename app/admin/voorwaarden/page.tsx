'use client'

import { useEffect, useState } from 'react'
import { FileText, Plus, Loader2, X, Trash2, Save } from 'lucide-react'
import { toast } from 'sonner'

type Term = { id: string; title: string; content: string | null; audiences: string[]; active: boolean; created_at: string }

const AUDIENCES: { value: string; label: string }[] = [
  { value: 'admin', label: 'Admin' },
  { value: 'client', label: 'Klantportaal' },
  { value: 'partner', label: 'Partnerportaal' },
]

export default function VoorwaardenPage() {
  const [terms, setTerms] = useState<Term[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Term | null>(null)
  const [creating, setCreating] = useState(false)

  const load = async () => {
    try { const r = await fetch('/api/admin/terms', { cache: 'no-store' }); const j = await r.json(); setTerms(j.terms ?? []) }
    catch { /* */ } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const del = async (t: Term) => {
    if (!confirm(`"${t.title}" verwijderen?`)) return
    try { const r = await fetch(`/api/admin/terms/${t.id}`, { method: 'DELETE' }); if (!r.ok) throw new Error((await r.json()).error); toast.success('Verwijderd'); load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Mislukt') }
  }
  const toggleActive = async (t: Term) => {
    try { const r = await fetch(`/api/admin/terms/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !t.active }) }); if (!r.ok) throw new Error((await r.json()).error); load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Mislukt') }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Voorwaarden & akkoorden</h1>
          <p className="text-sm text-gray-500 mt-0.5">Beheer voorwaarden en kies per item welke dashboards ze mogen zien.</p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary shrink-0"><Plus className="h-4 w-4" />Nieuwe voorwaarde</button>
      </div>

      {loading ? (
        <div className="card-base text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : terms.length === 0 ? (
        <div className="card-base text-center py-12 text-gray-400"><FileText className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="text-sm">Nog geen voorwaarden</p></div>
      ) : (
        <div className="space-y-2">
          {terms.map((t) => (
            <div key={t.id} className="card-base flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">{t.title}{!t.active && <span className="status-badge bg-gray-100 text-gray-500">Inactief</span>}</div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Zichtbaar voor: {t.audiences.length ? t.audiences.map((a) => AUDIENCES.find((x) => x.value === a)?.label ?? a).join(', ') : '— niemand'}
                </div>
                {t.content && <div className="text-xs text-gray-400 mt-1 line-clamp-2 whitespace-pre-wrap">{t.content}</div>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(t)} className="h-7 px-2 rounded-lg text-xs hover:bg-gray-100 text-gray-600">Bewerk</button>
                <label className="flex items-center gap-1 text-xs text-gray-500 px-1"><input type="checkbox" checked={t.active} onChange={() => toggleActive(t)} />actief</label>
                <button onClick={() => del(t)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(creating || editing) && (
        <Dialog term={editing} onClose={() => { setCreating(false); setEditing(null) }} onDone={() => { setCreating(false); setEditing(null); load() }} />
      )}
    </div>
  )
}

function Dialog({ term, onClose, onDone }: { term: Term | null; onClose: () => void; onDone: () => void }) {
  const [title, setTitle] = useState(term?.title ?? '')
  const [content, setContent] = useState(term?.content ?? '')
  const [audiences, setAudiences] = useState<string[]>(term?.audiences ?? ['client'])
  const [active, setActive] = useState(term?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggle = (a: string) => setAudiences((p) => p.includes(a) ? p.filter((x) => x !== a) : [...p, a])

  const submit = async () => {
    if (!title.trim()) { setError('Titel is verplicht'); return }
    setSaving(true); setError(null)
    try {
      const url = term ? `/api/admin/terms/${term.id}` : '/api/admin/terms'
      const r = await fetch(url, { method: term ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, audiences, active }) })
      if (!r.ok) throw new Error((await r.json()).error)
      toast.success(term ? 'Opgeslagen' : 'Aangemaakt'); onDone()
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setSaving(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold">{term ? 'Voorwaarde bewerken' : 'Nieuwe voorwaarde'}</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Titel *</label><input className={inp} value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Inhoud</label><textarea rows={8} className={inp} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Tekst van de voorwaarde / het akkoord…" /></div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zichtbaar op (rollen / dashboards)</label>
            <div className="flex flex-wrap gap-2">
              {AUDIENCES.map((a) => (
                <button key={a.value} type="button" onClick={() => toggle(a.value)} className={`text-xs px-3 py-1.5 rounded-lg border ${audiences.includes(a.value) ? 'border-[#fff848] bg-[#fff848]/10 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>{a.label}</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Actief (zichtbaar)</label>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={saving} className="btn-primary flex-1 justify-center">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Opslaan</button>
            <button onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
