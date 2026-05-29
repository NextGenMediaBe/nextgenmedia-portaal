'use client'

import { useState } from 'react'
import { Save, Loader2, Info } from 'lucide-react'

interface Zone {
  sig_page: number
  sig_x_pct: number
  sig_y_pct: number
  sig_width: number
  sig_height: number
}

export function SignatureZoneEditor({
  contractId,
  pdfUrl,
  initialZone,
}: {
  contractId: string
  pdfUrl: string | null
  initialZone: Zone
}) {
  const [zone, setZone] = useState<Zone>(initialZone)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

          <div className="grid grid-cols-2 gap-3">
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

          <div className="grid grid-cols-2 gap-3">
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
  )
}
