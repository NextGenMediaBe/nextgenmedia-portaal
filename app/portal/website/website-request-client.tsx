'use client'

import { useState } from 'react'
import { Plus, X, Loader2, Globe } from 'lucide-react'
import {
  formatDate,
  WEBDESIGN_STATUS_STYLE as STATUS_STYLE,
  WEBDESIGN_STATUS_LABEL as STATUS_LABEL,
  WEBDESIGN_KIND_LABEL as KIND_LABEL,
  resolveFriendlyKind,
  cleanDescription,
} from '@/lib/utils'

type Request = { id: string; title: string; description: string | null; kind: string; status: string; created_at: string }

const KIND_OPTIONS = [
  { value: 'text', label: 'Tekst aanpassen' },
  { value: 'color', label: 'Kleur aanpassen' },
  { value: 'image', label: 'Afbeelding vervangen' },
  { value: 'other', label: 'Andere opmerking' },
]

export function WebsiteRequestClient({
  clientId, initialRequests,
}: {
  clientId: string
  initialRequests: Request[]
}) {
  const [requests, setRequests] = useState(initialRequests)
  const [showForm, setShowForm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', kind: 'text' })
  const [images, setImages] = useState<File[]>([])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('client_id', clientId)
      fd.append('title', form.title)
      fd.append('description', form.description)
      fd.append('kind', form.kind)
      images.forEach((img) => fd.append('images', img))

      const res = await fetch('/api/portal/website-requests', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setRequests((prev) => [{
        id: json.id,
        title: form.title,
        description: form.description || null,
        kind: form.kind,
        status: 'new',
        created_at: new Date().toISOString(),
      }, ...prev])
      setForm({ title: '', description: '', kind: 'text' })
      setImages([])
      setShowForm(false)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold text-gray-900">Mijn aanvragen</h2>
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nieuwe aanvraag
        </button>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
        <p>U kan kleine aanpassingen aanvragen: teksten, kleuren, afbeeldingen of kleine opmerkingen. Voor grote wijzigingen neemt u best contact op met NextGenMedia.</p>
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <div className="card-base text-center py-12 text-gray-400">
          <Globe className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nog geen aanvragen</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => {
            const displayKind = resolveFriendlyKind(r)
            const displayDescription = cleanDescription(r.description)
            return (
              <div key={r.id} className="card-base">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                        {KIND_LABEL[displayKind] ?? displayKind}
                      </span>
                      <span className="text-xs text-gray-400">{formatDate(r.created_at)}</span>
                    </div>
                    <div className="font-medium text-sm">{r.title}</div>
                    {displayDescription && (
                      <div className="text-sm text-gray-500 mt-1">{displayDescription}</div>
                    )}
                  </div>
                  <span className={`status-badge shrink-0 ${STATUS_STYLE[r.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold">Nieuwe aanvraag</h3>
              <button onClick={() => setShowForm(false)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              <div>
                <label className={lbl}>Soort aanpassing</label>
                <div className="grid grid-cols-2 gap-2">
                  {KIND_OPTIONS.map((k) => (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, kind: k.value }))}
                      className={`px-3 py-2 rounded-lg border text-sm text-left transition-colors ${
                        form.kind === k.value
                          ? 'border-[#fff848] bg-[#fff848]/10 font-medium'
                          : 'border-gray-200 text-gray-500 hover:border-gray-300'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className={lbl}>Titel *</label>
                <input required className={inp} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Korte beschrijving" />
              </div>
              <div>
                <label className={lbl}>Omschrijving</label>
                <textarea rows={4} className={inp} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} placeholder="Meer details over de gewenste aanpassing..." />
              </div>
              {form.kind === 'image' && (
                <div>
                  <label className={lbl}>Afbeeldingen uploaden</label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={(e) => setImages(Array.from(e.target.files ?? []))}
                    className="block text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-[#fff848] file:text-black hover:file:bg-[#f5ee30]"
                  />
                  {images.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">{images.length} bestand(en) geselecteerd</p>
                  )}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={loading} className="btn-primary flex-1">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Aanvraag versturen
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Annuleer</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
