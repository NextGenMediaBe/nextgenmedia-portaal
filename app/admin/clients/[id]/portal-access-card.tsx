'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ShieldCheck, ShieldOff, Loader2, CheckCircle2, XCircle } from 'lucide-react'

const SERVICE_LABELS: Record<string, string> = {
  'social-media': 'Social Media',
  'webdesign': 'Website',
  'foto-video': 'Foto & Videografie',
  'grafisch-ontwerp': 'Grafisch Ontwerp',
  'marketing-consultancy': 'Marketing Consultancy',
  'ads': 'Google Advertising',
}

interface ServiceAccess {
  service_slug: string
  active: boolean
  signed_contract_id: string | null // if a signed contract exists for this service
}

export function PortalAccessCard({
  clientId,
  services,
}: {
  clientId: string
  services: ServiceAccess[]
}) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (services.length === 0) return null

  const grant = async (service_slug: string) => {
    setBusy(service_slug)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/grant-access`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setBusy(null)
    }
  }

  const revoke = async (service_slug: string) => {
    setBusy(service_slug + '_revoke')
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/grant-access`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-base space-y-3">
      <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-gray-400" />
        Portaaltoegang
      </h2>

      <div className="space-y-2">
        {services.map((svc) => {
          const isGranting = busy === svc.service_slug
          const isRevoking = busy === svc.service_slug + '_revoke'
          const isBusy = isGranting || isRevoking
          const label = SERVICE_LABELS[svc.service_slug] ?? svc.service_slug

          return (
            <div key={svc.service_slug} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                {svc.active ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                ) : (
                  <XCircle className="h-4 w-4 text-gray-300 shrink-0" />
                )}
                <div>
                  <div className="text-sm font-medium text-gray-900">{label}</div>
                  {svc.signed_contract_id && !svc.active && (
                    <div className="text-xs text-amber-600">Contract getekend — wacht op goedkeuring</div>
                  )}
                  {svc.active && (
                    <div className="text-xs text-green-600">Toegang verleend</div>
                  )}
                  {!svc.active && !svc.signed_contract_id && (
                    <div className="text-xs text-gray-400">Geen getekend contract</div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {!svc.active && (
                  <button
                    onClick={() => grant(svc.service_slug)}
                    disabled={isBusy}
                    className="btn-primary text-xs px-2.5 py-1.5 h-auto"
                  >
                    {isGranting ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                    Verlenen
                  </button>
                )}
                {svc.active && (
                  <button
                    onClick={() => revoke(svc.service_slug)}
                    disabled={isBusy}
                    className="btn-secondary text-xs px-2.5 py-1.5 h-auto text-red-600 hover:border-red-300"
                  >
                    {isRevoking ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldOff className="h-3 w-3" />}
                    Intrekken
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-2 py-1.5">
          {error}
        </div>
      )}
    </div>
  )
}
