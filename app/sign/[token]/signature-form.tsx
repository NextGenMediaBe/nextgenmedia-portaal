'use client'

import { useRef, useState, useEffect } from 'react'
import { Loader2, PenLine, RotateCcw, CheckCircle2, Download } from 'lucide-react'
import Link from 'next/link'

export function SignatureForm({
  contractId,
  token,
  defaultName,
  defaultEmail,
}: {
  contractId: string
  token: string
  defaultName: string
  defaultEmail: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: defaultName,
    email: defaultEmail,
    phone: '',
    address: '',
    vat: '',
    agreed: false,
  })

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const touch = e.touches[0]
      return { x: (touch.clientX - rect.left) * scaleX, y: (touch.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasSig(true)
  }

  const endDraw = () => setIsDrawing(false)

  const clearSig = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasSig(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!hasSig) { alert('Teken eerst uw handtekening'); return }
    if (!form.agreed) { alert('Accepteer de voorwaarden om verder te gaan'); return }

    const canvas = canvasRef.current!
    const signatureDataUrl = canvas.toDataURL('image/png')

    setLoading(true)
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          contract_id: contractId,
          signer_name: form.name,
          signer_email: form.email,
          signer_phone: form.phone || null,
          signer_address: form.address || null,
          signer_vat: form.vat || null,
          signature_data_url: signatureDataUrl,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setSignedPdfUrl(json.signed_pdf_url ?? null)
      setDone(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Er is iets misgegaan')
    } finally {
      setLoading(false)
    }
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="card-base text-center py-12 space-y-4">
        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Contract ondertekend</h2>
          <p className="text-sm text-gray-500">
            Bedankt. Uw handtekening is rechtstreeks op het contract geplaatst.
          </p>
        </div>
        {signedPdfUrl ? (
          <a
            href={signedPdfUrl}
            target="_blank"
            rel="noreferrer"
            className="btn-primary inline-flex mx-auto"
          >
            <Download className="h-4 w-4" />
            Getekend contract downloaden
          </a>
        ) : (
          <p className="text-sm text-gray-500">Het getekende contract wordt zo snel mogelijk beschikbaar gesteld.</p>
        )}
        <Link href="/portal/contracts" className="btn-secondary inline-flex mx-auto">
          Terug naar portaal
        </Link>
        <p className="text-xs text-gray-400">
          U ontvangt ook een bevestiging per e-mail.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="card-base space-y-4">
        <h2 className="font-semibold text-gray-900">Uw gegevens</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className={lbl}>Naam *</label>
            <input required className={inp} value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Volledige naam" />
          </div>
          <div>
            <label className={lbl}>E-mail *</label>
            <input required type="email" className={inp} value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="naam@bedrijf.be" />
          </div>
          <div>
            <label className={lbl}>Telefoon</label>
            <input className={inp} value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} placeholder="+32 ..." />
          </div>
          <div>
            <label className={lbl}>BTW-nummer</label>
            <input className={inp} value={form.vat} onChange={(e) => setForm((p) => ({ ...p, vat: e.target.value }))} placeholder="BE 0123.456.789" />
          </div>
          <div className="sm:col-span-2">
            <label className={lbl}>Adres</label>
            <input className={inp} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} placeholder="Straat nr, Postcode Stad" />
          </div>
        </div>
      </div>

      <div className="card-base space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Handtekening *</h2>
          </div>
          <button type="button" onClick={clearSig} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700">
            <RotateCcw className="h-3.5 w-3.5" />
            Wissen
          </button>
        </div>
        <div className="border-2 border-dashed border-gray-200 rounded-xl overflow-hidden bg-gray-50 touch-none">
          <canvas
            ref={canvasRef}
            width={800}
            height={200}
            className="w-full cursor-crosshair"
            style={{ touchAction: 'none' }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
        </div>
        {!hasSig && (
          <p className="text-xs text-gray-400 text-center">Teken hierboven met uw muis of vinger</p>
        )}
      </div>

      <div className="card-base">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.agreed}
            onChange={(e) => setForm((p) => ({ ...p, agreed: e.target.checked }))}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-gray-900"
          />
          <span className="text-sm text-gray-600">
            Ik bevestig dat ik het contract heb gelezen en ga akkoord met de vermelde voorwaarden. Ik begrijp dat mijn digitale handtekening rechtstreeks op het contract geplaatst wordt en juridisch bindend is.
          </span>
        </label>
      </div>

      <button type="submit" disabled={loading || !hasSig || !form.agreed} className="btn-primary w-full justify-center py-3">
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Contract ondertekenen en verwerken...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-4 w-4" />
            Contract ondertekenen
          </>
        )}
      </button>
    </form>
  )
}
