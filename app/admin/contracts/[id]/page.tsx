export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import { createAdminSupabaseClient, trySignedUrl } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { ChevronLeft, FileText, CheckCircle2, ExternalLink, Settings2, Download } from 'lucide-react'
import { ContractActions } from './contract-actions'
import { ContractPrintButton } from './contract-print-button'

async function getContract(id: string) {
  try {
    const admin = createAdminSupabaseClient()

    // All independent reads in one round-trip. Client lookup chains off the
    // contract result below; everything else parallelizes.
    const [{ data: contract }, { data: signatures }, { data: events }] = await Promise.all([
      admin.from('contracts').select('*').eq('id', id).maybeSingle(),
      admin.from('contract_signatures').select('*').eq('contract_id', id).order('signed_at', { ascending: false }),
      admin.from('contract_events').select('*').eq('contract_id', id).order('created_at', { ascending: false }),
    ])

    if (!contract) return null

    // Parallelize the remaining I/O: client lookup + both signed URLs.
    // For signed PDFs we speculatively request both the stored path AND the
    // conventional `signed/{id}.pdf` fallback — whichever resolves wins.
    const isSigned = contract.status === 'signed'
    const [clientRowResult, pdfUrl, signedPdfStored, signedPdfFallback] = await Promise.all([
      contract.client_id
        ? admin.from('clients').select('id, company_name').eq('id', contract.client_id).maybeSingle()
        : Promise.resolve({ data: null }),
      trySignedUrl(admin, 'contracts', contract.pdf_path),
      isSigned ? trySignedUrl(admin, 'contracts', contract.signed_pdf_path) : Promise.resolve(null),
      isSigned ? trySignedUrl(admin, 'contracts', `signed/${contract.id}.pdf`) : Promise.resolve(null),
    ])

    return {
      contract,
      clientName: clientRowResult.data?.company_name ?? null,
      clientId: clientRowResult.data?.id ?? null,
      signatures: signatures ?? [],
      events: events ?? [],
      pdfUrl,
      signedPdfUrl: signedPdfStored ?? signedPdfFallback,
    }
  } catch {
    return null
  }
}

const STATUS_MAP: Record<string, { cls: string; label: string }> = {
  draft:            { cls: 'bg-gray-100 text-gray-600',   label: 'Concept' },
  sent:             { cls: 'bg-blue-100 text-blue-700',   label: 'Verstuurd' },
  viewed:           { cls: 'bg-amber-100 text-amber-700', label: 'Bekeken' },
  signed:           { cls: 'bg-green-100 text-green-700', label: 'Getekend' },
  expired:          { cls: 'bg-red-100 text-red-700',     label: 'Verlopen' },
  cancelled:        { cls: 'bg-gray-100 text-gray-500',   label: 'Geannuleerd' },
  vervangen:        { cls: 'bg-orange-100 text-orange-700', label: 'Vervangen' },
}

const EVENT_LABELS: Record<string, string> = {
  created:   'Aangemaakt',
  sent:      'Verstuurd',
  viewed:    'Bekeken',
  signed:    'Ondertekend',
  cancelled: 'Geannuleerd',
  expired:   'Verlopen',
  replaced:  'Vervangen',
}

export default async function ContractDetailPage({ params }: { params: { id: string } }) {
  const data = await getContract(params.id)
  if (!data) notFound()

  const { contract: c, clientName, clientId, signatures, events, pdfUrl, signedPdfUrl } = data
  const style = STATUS_MAP[c.status] ?? STATUS_MAP.draft
  const isSigned = c.status === 'signed'
  // Prefer the signed PDF for preview when available, fall back to the original.
  const displayPdfUrl = signedPdfUrl ?? pdfUrl

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-start gap-3 flex-wrap">
        <Link href="/admin/contracts" className="btn-secondary px-2 shrink-0">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{c.title}</h1>
            <span className={`status-badge ${style.cls}`}>{style.label}</span>
          </div>
          {clientId && clientName && (
            <Link href={`/admin/clients/${clientId}`} className="text-sm text-gray-500 hover:text-black">
              {clientName}
            </Link>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {!isSigned && (
            <Link
              href={`/admin/contracts/${c.id}/setup`}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Settings2 className="h-4 w-4" />
              <span className="hidden sm:inline">Handtekeningzone</span>
              <span className="sm:hidden">Zone</span>
            </Link>
          )}
          {isSigned && signedPdfUrl && (
            <a
              href={signedPdfUrl}
              target="_blank"
              rel="noreferrer"
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Getekend contract</span>
              <span className="sm:hidden">Download</span>
            </a>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* PDF Preview — show signed version when available */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2 text-sm font-medium">
              <FileText className="h-4 w-4 text-gray-400" />
              {isSigned && signedPdfUrl ? (
                <span className="flex items-center gap-1.5">
                  Contract PDF
                  <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">Getekend</span>
                </span>
              ) : 'Contract PDF'}
            </div>
            <div className="flex items-center gap-3">
              {isSigned && signedPdfUrl && (
                <ContractPrintButton pdfUrl={signedPdfUrl} />
              )}
              {displayPdfUrl && (
                <a href={displayPdfUrl} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <ExternalLink className="h-3 w-3" />
                  Nieuw tabblad
                </a>
              )}
            </div>
          </div>
          {displayPdfUrl ? (
            <iframe
              src={displayPdfUrl}
              title="Contract"
              className="w-full bg-gray-50"
              style={{ height: 'min(70vh, 600px)' }}
            />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-gray-400">
              <div className="text-center">
                <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Geen PDF beschikbaar</p>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Info */}
          <div className="card-base space-y-3">
            <h2 className="font-semibold text-sm">Details</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Aangemaakt:</span>
                <span>{formatDate(c.created_at)}</span>
              </div>
              {c.sent_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Verstuurd:</span>
                  <span>{formatDate(c.sent_at)}</span>
                </div>
              )}
              {c.signed_at && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Getekend:</span>
                  <span>{formatDate(c.signed_at)}</span>
                </div>
              )}
              {c.signer_name && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Ondertekenaar:</span>
                  <span>{c.signer_name}</span>
                </div>
              )}
              {c.service_slug && (
                <div className="flex justify-between">
                  <span className="text-gray-500">Dienst:</span>
                  <span className="capitalize">{c.service_slug.replace(/-/g, ' ')}</span>
                </div>
              )}
              {c.signer_email && (
                <div className="flex justify-between">
                  <span className="text-gray-500">E-mail:</span>
                  <span className="truncate text-right max-w-[140px]">{c.signer_email}</span>
                </div>
              )}
            </div>
          </div>

          {/* Sign link — only for unsigned contracts */}
          {['draft', 'sent', 'viewed'].includes(c.status) && (
            <div className="card-base space-y-3">
              <h2 className="font-semibold text-sm">Ondertekeningslink</h2>
              <div className="flex gap-2">
                <code className="flex-1 text-xs bg-gray-50 border border-gray-200 rounded px-2 py-1.5 truncate">
                  /sign/{c.access_token?.slice(0, 16)}...
                </code>
                <a href={`/sign/${c.access_token}`} target="_blank" rel="noreferrer" className="btn-secondary text-xs px-2">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Signed PDF — only when signed */}
          {isSigned && (
            <div className="card-base space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Getekend contract
              </h2>
              {signedPdfUrl ? (
                <div className="space-y-2">
                  <a
                    href={signedPdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary w-full justify-center text-sm"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download getekende PDF
                  </a>
                  <p className="text-xs text-gray-400 text-center">
                    Handtekening is rechtstreeks op het contract geplaatst
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {pdfUrl && (
                    <a
                      href={pdfUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary w-full justify-center text-sm"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download origineel contract
                    </a>
                  )}
                  <a
                    href={`/sign/${c.access_token}/receipt`}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary w-full justify-center text-sm"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ondertekeningsbewijs
                  </a>
                  <p className="text-xs text-gray-400 text-center">
                    De ingebedde getekende PDF is niet beschikbaar — gebruik het origineel + bewijs als juridisch bewijs.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Setup link — only for unsigned contracts */}
          {!isSigned && c.pdf_path && (
            <div className="card-base space-y-2">
              <h2 className="font-semibold text-sm">Handtekeningzone</h2>
              <Link
                href={`/admin/contracts/${c.id}/setup`}
                className="btn-secondary w-full justify-center text-sm"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Zone instellen
              </Link>
            </div>
          )}

          {/* Actions */}
          <ContractActions contract={{ id: c.id, status: c.status, access_token: c.access_token }} />

          {/* Signatures */}
          {signatures.length > 0 && (
            <div className="card-base space-y-3">
              <h2 className="font-semibold text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Handtekeningen
              </h2>
              {signatures.map((sig: {
                id: string
                signer_name: string
                signer_email: string
                signed_at: string
                ip_address?: string | null
              }) => (
                <div key={sig.id} className="text-sm space-y-1">
                  <div className="font-medium">{sig.signer_name}</div>
                  <div className="text-gray-500">{sig.signer_email}</div>
                  <div className="text-xs text-gray-400">{formatDate(sig.signed_at)}</div>
                  {sig.ip_address && (
                    <div className="text-xs text-gray-400 font-mono">IP: {sig.ip_address}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Events */}
          {events.length > 0 && (
            <div className="card-base space-y-2">
              <h2 className="font-semibold text-sm">Activiteiten</h2>
              <div className="space-y-2">
                {events.slice(0, 8).map((e: { id: string; event_type: string; created_at: string; actor_email?: string }) => (
                  <div key={e.id} className="flex items-start gap-2 text-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 mt-1.5 shrink-0" />
                    <div>
                      <span className="font-medium">{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                      {e.actor_email && <span className="text-gray-400"> · {e.actor_email}</span>}
                      <div className="text-gray-400">{formatDate(e.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
