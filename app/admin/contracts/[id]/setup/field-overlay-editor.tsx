'use client'

import { useRef, useState } from 'react'
import { GripVertical } from 'lucide-react'

// Visuele drag & drop editor: sleep velden + handtekeningzone bovenop de PDF.
// x/y in % (links/boven), width/height in punten. Bij verslepen/resizen worden
// de coördinaten automatisch bijgewerkt — geen manuele invoer meer nodig.

type Field = { label: string; type: string; page_number: number; x: number; y: number; width: number; height: number; required: boolean; placeholder?: string }
type Zone = { sig_page: number; sig_x_pct: number; sig_y_pct: number; sig_width: number; sig_height: number }

// Benaderende A4-puntmaten voor visuele schaling van breedte/hoogte.
const PT_W = 595
const PT_H = 842

export function FieldOverlayEditor({
  pdfUrl, fields, setFields, zone, setZone,
}: {
  pdfUrl: string | null
  fields: Field[]
  setFields: (updater: (f: Field[]) => Field[]) => void
  zone: Zone
  setZone: (updater: (z: Zone) => Zone) => void
}) {
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<number | null>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const drag = useRef<null | { kind: 'field' | 'zone'; index: number; mode: 'move' | 'resize'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } }>(null)

  const maxPage = Math.max(1, zone.sig_page, ...fields.map((f) => f.page_number || 1))

  const onPointerDown = (
    e: React.PointerEvent, kind: 'field' | 'zone', index: number, mode: 'move' | 'resize',
  ) => {
    e.preventDefault(); e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    const orig = kind === 'zone'
      ? { x: zone.sig_x_pct, y: zone.sig_y_pct, w: zone.sig_width, h: zone.sig_height }
      : { x: fields[index].x, y: fields[index].y, w: fields[index].width, h: fields[index].height }
    drag.current = { kind, index, mode, startX: e.clientX, startY: e.clientY, orig }
    if (kind === 'field') setSelected(index)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!d || !rect) return
    const dxPct = ((e.clientX - d.startX) / rect.width) * 100
    const dyPct = ((e.clientY - d.startY) / rect.height) * 100
    const clamp = (v: number) => Math.max(0, Math.min(98, v))

    if (d.mode === 'move') {
      const nx = clamp(d.orig.x + dxPct)
      const ny = clamp(d.orig.y + dyPct)
      if (d.kind === 'zone') setZone((z) => ({ ...z, sig_x_pct: Math.round(nx), sig_y_pct: Math.round(ny) }))
      else setFields((fs) => fs.map((f, i) => i === d.index ? { ...f, x: Math.round(nx), y: Math.round(ny) } : f))
    } else {
      // Resize: schaal pixel-delta terug naar punten.
      const dwPt = ((e.clientX - d.startX) / rect.width) * PT_W
      const dhPt = ((e.clientY - d.startY) / rect.height) * PT_H
      const nw = Math.max(40, Math.round(d.orig.w + dwPt))
      const nh = Math.max(16, Math.round(d.orig.h + dhPt))
      if (d.kind === 'zone') setZone((z) => ({ ...z, sig_width: Math.max(50, nw), sig_height: Math.max(30, nh) }))
      else setFields((fs) => fs.map((f, i) => i === d.index ? { ...f, width: nw, height: nh } : f))
    }
  }

  const onPointerUp = () => { drag.current = null }

  const boxStyle = (x: number, y: number, w: number, h: number): React.CSSProperties => ({
    left: `${x}%`, top: `${y}%`,
    width: `${Math.min(95, (w / PT_W) * 100)}%`,
    height: `${Math.max(2.2, (h / PT_H) * 100)}%`,
  })

  const pageFields = fields.map((f, i) => ({ f, i })).filter(({ f }) => (f.page_number || 1) === page)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs">
          <span className="text-gray-500">Pagina:</span>
          {Array.from({ length: maxPage }, (_, i) => i + 1).map((p) => (
            <button
              key={p} onClick={() => setPage(p)}
              className={`h-7 w-7 rounded-lg text-xs font-medium ${p === page ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >{p}</button>
          ))}
          <button onClick={() => setPage(maxPage + 1)} className="h-7 px-2 rounded-lg text-xs border border-dashed border-gray-300 text-gray-500 hover:bg-gray-50">+ pagina</button>
        </div>
        <p className="text-[11px] text-gray-400">Sleep velden om te verplaatsen · hoekje rechtsonder om te vergroten</p>
      </div>

      <div className="relative w-full mx-auto border-2 border-gray-200 rounded-lg overflow-hidden bg-gray-50" style={{ paddingBottom: '141.4%' }}>
        {/* PDF-achtergrond (pagina via fragment) */}
        {pdfUrl ? (
          <iframe
            key={page}
            src={`${pdfUrl}#page=${page}&toolbar=0&navpanes=0&view=FitH`}
            title="PDF"
            className="absolute inset-0 w-full h-full pointer-events-none"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Geen PDF beschikbaar</div>
        )}

        {/* Overlay-laag */}
        <div
          ref={canvasRef}
          className="absolute inset-0"
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
          onClick={() => setSelected(null)}
          style={{ touchAction: 'none' }}
        >
          {/* Velden op deze pagina */}
          {pageFields.map(({ f, i }) => (
            <div
              key={i}
              onPointerDown={(e) => onPointerDown(e, 'field', i, 'move')}
              className={`absolute rounded border-2 bg-blue-500/15 flex items-center px-1 cursor-move select-none ${selected === i ? 'border-blue-600' : 'border-blue-400'}`}
              style={boxStyle(f.x, f.y, f.width, f.height)}
            >
              <GripVertical className="h-3 w-3 text-blue-600 shrink-0" />
              <span className="text-[10px] text-blue-800 font-medium truncate ml-0.5">{f.label}{f.required ? ' *' : ''}</span>
              <span
                onPointerDown={(e) => onPointerDown(e, 'field', i, 'resize')}
                className="absolute -bottom-1 -right-1 h-3 w-3 bg-blue-600 rounded-sm cursor-se-resize"
              />
            </div>
          ))}

          {/* Handtekeningzone (alleen op haar pagina) */}
          {zone.sig_page === page && (
            <div
              onPointerDown={(e) => onPointerDown(e, 'zone', -1, 'move')}
              className="absolute rounded border-2 border-[#caa800] bg-[#fff848]/30 flex items-center justify-center cursor-move select-none"
              style={boxStyle(zone.sig_x_pct, zone.sig_y_pct, zone.sig_width, zone.sig_height)}
            >
              <span className="text-[10px] text-[#8a7a00] font-semibold">✎ Handtekening</span>
              <span
                onPointerDown={(e) => onPointerDown(e, 'zone', -1, 'resize')}
                className="absolute -bottom-1 -right-1 h-3 w-3 bg-[#caa800] rounded-sm cursor-se-resize"
              />
            </div>
          )}
        </div>
      </div>

      {/* Handtekeningzone naar deze pagina verplaatsen */}
      {zone.sig_page !== page && (
        <button
          onClick={() => setZone((z) => ({ ...z, sig_page: page }))}
          className="text-xs text-[#8a7a00] hover:underline"
        >
          ✎ Handtekeningzone naar pagina {page} verplaatsen
        </button>
      )}
    </div>
  )
}
