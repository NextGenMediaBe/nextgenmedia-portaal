'use client'

import { useState } from 'react'
import { Save, Loader2, Info, Sparkles, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

interface Zone {
  sig_page: number
  sig_x_pct: number
  sig_y_pct: number
  sig_width: number
  sig_height: number
}

type Field = { label: string; type: string; page_number: number; x: number; y: number; width: number; height: number; required: boolean; placeholder?: string }
const FIELD_TYPES = ['text', 'email', 'phone', 'date', 'number', 'checkbox', 'signature']

export function SignatureZoneEditor({
  contractId,
  pdfUrl,
  initialZone,
  initialFields = [],
}: {
  contractId: string
  pdfUrl: string | null
  initialZone: Zone
  initialFields?: Field[]
}) {
  const [zone, setZone] = useState<Zone>(initialZone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fields, setFields] = useState<Field[]>(initialFields)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingFields, setSavingFields] = useState(false)

  const analyze = async () => {
    setAnalyzing(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/analyze`, { method: 'POST' })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      setFields(j.fields ?? [])
      if (j.signature) setZone((z) => ({ ...z, sig_page: j.signature.page, sig_x_pct: j.signature.x, sig_y_pct: j.signature.y, sig_width: j.signature.width, sig_height: j.signature.height }))
      toast.success(`${(j.fields ?? []).length} veld(en) gedetecteerd. Controleer en pas aan.`)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Analyse mislukt') } finally { setAnalyzing(false) }
  }
  const setF = (i: number, patch: Partial<Field>) => setFields((fs) => fs.map((f, idx) => idx === i ? { ...f, ...patch } : f))
  const addField = () => setFields((fs) => [...fs, { label: 'Nieuw veld', type: 'text', page_number: 1, x: 10, y: 50, width: 180, height: 22, required: false }])
  const delField = (i: number) => setFields((fs) => fs.filter((_, idx) => idx !== i))
  const saveFields = async () => {
    setSavingFields(true)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/field-values`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ detected_fields: fields }) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success('Velden opgeslagen.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Opslaan mislukt') } finally { setSavingFields(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  const setField = (field: keyof Zone, value: number) =>
    setZone((prev) => ({ ...prev, [field]: value }))

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/contracts/${contractId}/signature-zone`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(zone),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij opslaan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <p className="text-sm text-gray-500">Laat AI invulvelden + handtekeningzone detecteren, controleer en pas aan. AI beslist nooit alleen.</p>
      <button onClick={analyze} disabled={analyzing} className="btn-primary text-sm">{analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Analyseer met AI</button>
    </div>
    <div className="grid lg:grid-cols-2 gap-6">
      {/* PDF viewer */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Contract PDF</span>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Info className="h-3.5 w-3.5" />
            Bekijk de PDF en stel rechts de positie in
          </div>
        </div>
        {pdfUrl ? (
          <iframe src={pdfUrl} title="Contract" className="w-full" style={{ height: '70vh' }} />
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
            Geen PDF beschikbaar
          </div>
        )}
      </div>

      {/* Zone settings */}
      <div className="space-y-4">
        <div className="card-base space-y-4">
          <h2 className="font-semibold text-gray-900">Handtekeningzone</h2>

          <div>
            <label className={lbl}>Paginanummer</label>
            <input
              type="number"
              min="1"
              className={inp}
              value={zone.sig_page}
              onChange={(e) => setField('sig_page', Math.max(1, Number(e.target.value)))}
            />
            <p className="text-xs text-gray-400 mt-1">Pagina waar de handtekening geplaatst wordt</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>X-positie (% van links)</label>
              <input
                type="number" min="0" max="95" step="1" className={inp}
                value={zone.sig_x_pct}
                onChange={(e) => setField('sig_x_pct', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={lbl}>Y-positie (% van boven)</label>
              <input
                type="number" min="0" max="95" step="1" className={inp}
                value={zone.sig_y_pct}
                onChange={(e) => setField('sig_y_pct', Number(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Breedte (punten)</label>
              <input
                type="number" min="50" max="400" step="10" className={inp}
                value={zone.sig_width}
                onChange={(e) => setField('sig_width', Number(e.target.value))}
              />
            </div>
            <div>
              <label className={lbl}>Hoogte (punten)</label>
              <input
                type="number" min="30" max="150" step="5" className={inp}
                value={zone.sig_height}
                onChange={(e) => setField('sig_height', Number(e.target.value))}
              />
            </div>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className={`btn-primary w-full ${saved ? '!bg-green-500' : ''}`}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saved ? 'Opgeslagen!' : 'Positie opslaan'}
          </button>
        </div>

        {/* Visual preview */}
        <div className="card-base">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Positie-preview</h3>
          <p className="text-xs text-gray-400 mb-3">Schematische weergave van de handtekeningpositie op de pagina</p>
          <div
            className="relative bg-white border-2 border-gray-300 rounded mx-auto"
            style={{ width: '100%', paddingBottom: '141.4%' }}
          >
            {/* Decorative text lines */}
            {[15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65].map((y) => (
              <div
                key={y}
                className="absolute bg-gray-100 rounded"
                style={{ left: '5%', right: '5%', top: `${y}%`, height: '1%' }}
              />
            ))}
            {/* Signature zone marker */}
            <div
              className="absolute border-2 border-[#fff848] bg-[#fff848]/20 rounded flex items-center justify-center"
              style={{
                left: `${zone.sig_x_pct}%`,
                top: `${zone.sig_y_pct}%`,
                width: `${Math.min(zone.sig_width / 5.95, 90)}%`,
                height: `${Math.min(zone.sig_height / 8.42, 20)}%`,
                minHeight: '6%',
              }}
            >
              <span className="text-[8px] text-[#8a7a00] font-medium">✎ Handtekening</span>
            </div>
            <div className="absolute bottom-1 left-0 right-0 text-center">
              <span className="text-[8px] text-gray-400">Pagina {zone.sig_page}</span>
            </div>
          </div>
          <p className="text-xs text-gray-400 text-center mt-2">
            Positie: {zone.sig_x_pct}% van links, {zone.sig_y_pct}% van boven
          </p>
        </div>
      </div>
    </div>

      {/* AI-gedetecteerde invulvelden — controleren & aanpassen */}
      <div className="card-base">
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h2 className="font-semibold text-gray-900">Invulvelden ({fields.length})</h2>
          <div className="flex gap-2">
            <button onClick={addField} className="btn-secondary text-xs"><Plus className="h-3.5 w-3.5" />Veld toevoegen</button>
            <button onClick={saveFields} disabled={savingFields} className="btn-primary text-xs">{savingFields ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}Velden opslaan</button>
          </div>
        </div>
        {fields.length === 0 ? (
          <p className="text-sm text-gray-400">Nog geen velden. Klik op <b>Analyseer met AI</b> of voeg handmatig een veld toe.</p>
        ) : (
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-[10px] text-gray-400 px-1">
              <span className="col-span-3">Label</span><span className="col-span-2">Type</span><span className="col-span-1">Pag.</span><span className="col-span-1">X%</span><span className="col-span-1">Y%</span><span className="col-span-1">Breedte</span><span className="col-span-2">Verplicht</span><span className="col-span-1"></span>
            </div>
            {fields.map((f, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <input className="col-span-12 sm:col-span-3 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.label} onChange={(e) => setF(i, { label: e.target.value })} placeholder="Label" />
                <select className="col-span-4 sm:col-span-2 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.type} onChange={(e) => setF(i, { type: e.target.value })}>{FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                <input type="number" min="1" className="col-span-2 sm:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.page_number} onChange={(e) => setF(i, { page_number: Number(e.target.value) })} />
                <input type="number" min="0" max="100" className="col-span-2 sm:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.x} onChange={(e) => setF(i, { x: Number(e.target.value) })} />
                <input type="number" min="0" max="100" className="col-span-2 sm:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.y} onChange={(e) => setF(i, { y: Number(e.target.value) })} />
                <input type="number" min="20" className="col-span-2 sm:col-span-1 px-2 py-1.5 text-xs border border-gray-200 rounded-lg" value={f.width} onChange={(e) => setF(i, { width: Number(e.target.value) })} />
                <label className="col-span-3 sm:col-span-2 text-xs text-gray-600 flex items-center gap-1.5"><input type="checkbox" checked={f.required} onChange={(e) => setF(i, { required: e.target.checked })} />verplicht</label>
                <button onClick={() => delField(i)} className="col-span-1 h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400 justify-self-end" title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-gray-400 mt-3">x/y = positie in % van de pagina (links/boven). Breedte in punten. De ontvanger vult deze velden in bij ondertekening.</p>
      </div>
    </div>
  )
}
