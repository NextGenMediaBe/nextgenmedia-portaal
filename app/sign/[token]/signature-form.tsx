'use client'

import { useRef, useState, useEffect } from 'react'
import { Loader2, PenLine, RotateCcw, CheckCircle2, Download } from 'lucide-react'
import Link from 'next/link'

export function SignatureForm({
  contractId,
  token,
  signerName,
  signerEmail,
}: {
  contractId: string
  token: string
  signerName: string
  signerEmail: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [agreed, setAgreed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [signedPdfUrl, setSignedPdfUrl] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#111'
    ctx.lineWidth = 2.5
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
    if (!hasSig) return
    if (!agreed) return

    setLoading(true)
    try {
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          contract_id: contractId,
          signer_name: signerName,
          signer_email: signerEmail,
          signature_data_url: canvasRef.current!.toDataURL('image/png'),
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

  // ── Success state ────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="card-base text-center py-12 space-y-4">
        <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div>
          <h2 className="text-xl font-bold mb-2">Contract ondertekend</h2>
          <p className="text-sm text-gray-500">
            Bedankt{signerName ? `, ${signerName}` : ''}. Uw handtekening is rechtstreeks op het contract geplaatst.
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
          <p className="text-sm text-gray-500">Het getekende contract is beschikbaar in uw portaal.</p>
        )}
        <Link href="/portal/contracts" className="btn-secondary inline-flex mx-auto">
          Terug naar portaal
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Who is signing */}
      {(signerName || signerEmail) && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-[#fff848] flex items-center justify-center shrink-0">
            <span className="text-sm font-bold text-black">
              {signerName ? signerName.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
          <div className="min-w-0">
            {signerName && <div className="text-sm font-semibold text-gray-900 truncate">{signerName}</div>}
            {signerEmail && <div className="text-xs text-gray-500 truncate">{signerEmail}</div>}
          </div>
        </div>
      )}

      {/* Signature canvas */}
      <div className="card-base space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="h-4 w-4 text-gray-400" />
            <h2 className="font-semibold text-gray-900">Uw handtekening</h2>
          </div>
          {hasSig && (
            <button
              type="button"
              onClick={clearSig}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Opnieuw
            </button>
          )}
        </div>
        <div
          className={`border-2 rounded-xl overflow-hidden bg-white touch-none transition-colors ${
            hasSig ? 'border-[#fff848]' : 'border-dashed border-gray-300'
          }`}
        >
          <canvas
            ref={canvasRef}
            width={800}
            height={220}
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
          <p className="text-xs text-gray-400 text-center">
            Teken hier uw handtekening — met muis of vinger
          </p>
        )}
      </div>

      {/* Agreement */}
      <div className="card-base">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-gray-900 shrink-0"
          />
          <span className="text-sm text-gray-600 leading-relaxed">
            Ik bevestig dat ik het contract heb gelezen en ga akkoord met de vermelde voorwaarden.
            Mijn digitale handtekening is juridisch bindend.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={loading || !hasSig || !agreed}
        className="btn-primary w-full justify-center py-3 text-base disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Verwerken...
          </>
        ) : (
          <>
            <CheckCircle2 className="h-5 w-5" />
            Contract ondertekenen
          </>
        )}
      </button>
    </form>
  )
}
