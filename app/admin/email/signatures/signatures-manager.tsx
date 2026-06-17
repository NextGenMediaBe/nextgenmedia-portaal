'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, X, Loader2, Trash2, Star, PenLine, CheckCircle2 } from 'lucide-react'

type Signature = { id: string; name: string; is_default: boolean; previewUrl: string | null }

export function SignaturesManager() {
  const [items, setItems] = useState<Signature[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/email/signatures')
      const j = await res.json()
      if (res.ok) setItems((j.signatures ?? []) as Signature[])
    } catch { /* stil */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const setDefault = async (id: string) => {
    setBusy(id)
    try { await fetch('/api/admin/email/signatures', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, is_default: true }) }); await load() }
    finally { setBusy(null) }
  }
  const remove = async (id: string) => {
    if (!confirm('Handtekening verwijderen?')) return
    setBusy(id)
    try { await fetch(`/api/admin/email/signatures?id=${id}`, { method: 'DELETE' }); setItems((s) => s.filter((x) => x.id !== id)) }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-sm text-gray-500">Upload een PNG-handtekening. Kies er één als standaard en koppel ze per template. De handtekening verschijnt onderaan de mail als afbeelding.</p>
        <button onClick={() => setAdding(true)} className="btn-primary text-sm"><Plus className="h-4 w-4" />Nieuwe handtekening</button>
      </div>

      {loading ? (
        <div className="card-base text-center text-gray-400 py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : items.length === 0 ? (
        <div className="card-base text-center text-gray-400 py-10">
          <PenLine className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nog geen handtekeningen.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((s) => (
            <div key={s.id} className="card-base">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.name}</span>
                  {s.is_default && <span className="inline-flex items-center gap-1 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full"><CheckCircle2 className="h-3 w-3" />Standaard</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {!s.is_default && (
                    <button onClick={() => setDefault(s.id)} disabled={busy === s.id} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" title="Als standaard instellen"><Star className="h-3.5 w-3.5" /></button>
                  )}
                  <button onClick={() => remove(s.id)} disabled={busy === s.id} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400" title="Verwijderen">{busy === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
                </div>
              </div>
              {s.previewUrl ? (
                <img src={s.previewUrl} alt={s.name} className="max-h-20 w-auto" />
              ) : (
                <p className="text-xs text-gray-300">Geen afbeelding</p>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && <AddDialog onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load() }} />}
    </div>
  )
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [isDefault, setIsDefault] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!name.trim()) { setError('Naam is verplicht'); return }
    if (!file) { setError('Upload een PNG-afbeelding'); return }
    setLoading(true); setError(null)
    try {
      const fd = new FormData()
      fd.append('name', name); fd.append('is_default', String(isDefault)); fd.append('image', file)
      const res = await fetch('/api/admin/email/signatures', { method: 'POST', body: fd })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      onAdded()
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setLoading(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold">Nieuwe handtekening</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Naam</label>
            <input className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="Bv. Mathias — NextGenMedia" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">PNG-afbeelding</label>
            <input type="file" accept="image/png,image/jpeg" className="text-xs" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
            Als standaardhandtekening instellen
          </label>
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
