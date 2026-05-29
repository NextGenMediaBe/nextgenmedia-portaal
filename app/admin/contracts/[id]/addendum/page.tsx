import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from '@/components/print-button'
import { ChevronLeft, CheckCircle2, Shield, FileText, Clock, Monitor } from 'lucide-react'

function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: 'Europe/Brussels',
  }) + ' (CET/CEST)'
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const EVENT_LABELS: Record<string, string> = {
  created: 'Aangemaakt',
  sent: 'Verstuurd naar klant',
  viewed: 'Bekeken door klant',
  signed: 'Ondertekend',
  cancelled: 'Geannuleerd',
  expired: 'Verlopen',
  replaced: 'Vervangen door nieuwere versie',
}

export default async function ContractAddendumPage({ params }: { params: { id: string } }) {
  const admin = createAdminSupabaseClient()

  // Use separate queries — no FK joins (avoids PostgREST FK constraint requirement)
  const [{ data: contract }, { data: signatures }, { data: events }] = await Promise.all([
    admin.from('contracts').select('*').eq('id', params.id).maybeSingle(),
    admin.from('contract_signatures').select('*').eq('contract_id', params.id).order('signed_at', { ascending: true }),
    admin.from('contract_events').select('*').eq('contract_id', params.id).order('created_at', { ascending: true }),
  ])

  if (!contract || contract.status !== 'signed') notFound()

  // Fetch client name
  let companyName: string | null = null
  if (contract.client_id) {
    const { data: clientRow } = await admin
      .from('clients').select('company_name').eq('id', contract.client_id).maybeSingle()
    companyName = clientRow?.company_name ?? null
  }

  const referenceId = `NGM-${contract.id.slice(0, 8).toUpperCase()}`
  const allSignatures = signatures ?? []
  const allEvents = events ?? []

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Admin toolbar — hidden on print */}
      <div className="print:hidden bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Link href={`/admin/contracts/${params.id}`} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ChevronLeft className="h-4 w-4" />
          Terug naar contract
        </Link>
        <div className="flex-1" />
        <PrintButton label="Afdrukken / PDF" />
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 print:py-0 print:px-0">

        {/* Document header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b border-gray-300">
          <div className="flex items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-gray-900 flex items-center justify-center shrink-0">
              <span className="font-bold text-white text-sm">NG</span>
            </div>
            <div>
              <div className="font-bold text-gray-900 text-lg">NextGenMedia</div>
              <div className="text-sm text-gray-500">Officieel ondertekeningsaddendum</div>
            </div>
          </div>
          <div className="text-right text-sm text-gray-500">
            <div className="font-mono font-semibold text-gray-800">{referenceId}</div>
            <div className="text-xs mt-0.5">Gegenereerd op {formatDate(new Date().toISOString())}</div>
          </div>
        </div>

        {/* Status banner */}
        <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4 mb-8 print:rounded-none">
          <CheckCircle2 className="h-8 w-8 text-green-600 shrink-0" />
          <div>
            <h1 className="font-bold text-green-900 text-xl">Contract rechtsgeldig ondertekend</h1>
            <p className="text-sm text-green-700 mt-0.5">
              Dit addendum bevestigt de digitale ondertekening en vormt een onlosmakelijk onderdeel van het originele contract.
            </p>
          </div>
        </div>

        {/* Section 1 — Contract details */}
        <div className="bg-white border border-gray-200 rounded-2xl mb-6 print:rounded-none print:border-gray-300 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-200">
            <FileText className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-800">Sectie 1 — Contractgegevens</span>
          </div>
          <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5 text-sm">
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contracttitel</div>
              <div className="font-medium text-gray-900">{contract.title}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Contractreferentie</div>
              <div className="font-mono text-gray-700">{referenceId}</div>
            </div>
            {companyName && (
              <div>
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Klant / Opdrachtgever</div>
                <div className="font-medium text-gray-900">{companyName}</div>
              </div>
            )}
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Opdrachtgever</div>
              <div className="font-medium text-gray-900">NextGenMedia</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Aangemaakt op</div>
              <div className="text-gray-700">{formatDate(contract.created_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Verstuurd op</div>
              <div className="text-gray-700">{formatDate(contract.sent_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Ondertekend op</div>
              <div className="font-medium text-gray-900">{formatDateTime(contract.signed_at)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Status</div>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                <CheckCircle2 className="h-3 w-3" />
                Getekend
              </span>
            </div>
          </div>
        </div>

        {/* Section 2 — Signer(s) */}
        <div className="bg-white border border-gray-200 rounded-2xl mb-6 print:rounded-none print:border-gray-300 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-200">
            <Shield className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-800">Sectie 2 — Ondertekenaar(s)</span>
          </div>

          {allSignatures.length === 0 ? (
            // Fallback: use contract-level signer data
            <div className="px-6 py-5 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Naam</div>
                  <div className="font-medium text-gray-900">{contract.signer_name ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">E-mail</div>
                  <div className="text-gray-700">{contract.signer_email ?? '—'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Tijdstip</div>
                  <div className="text-gray-700">{formatDateTime(contract.signed_at)}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {allSignatures.map((sig: {
                id: string
                signer_name: string
                signer_email: string
                signer_phone?: string | null
                signer_address?: string | null
                signer_vat?: string | null
                signed_at: string
                ip_address?: string | null
                user_agent?: string | null
                signature_url?: string | null
              }, idx: number) => (
                <div key={sig.id} className="px-6 py-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center text-xs font-bold text-green-700">
                      {idx + 1}
                    </div>
                    <span className="font-medium text-gray-800 text-sm">Ondertekenaar {idx + 1}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Volledige naam</div>
                      <div className="font-medium text-gray-900">{sig.signer_name}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">E-mailadres</div>
                      <div className="text-gray-700">{sig.signer_email}</div>
                    </div>
                    {sig.signer_phone && (
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Telefoon</div>
                        <div className="text-gray-700">{sig.signer_phone}</div>
                      </div>
                    )}
                    {sig.signer_vat && (
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">BTW-nummer</div>
                        <div className="text-gray-700">{sig.signer_vat}</div>
                      </div>
                    )}
                    {sig.signer_address && (
                      <div className="sm:col-span-2">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Adres</div>
                        <div className="text-gray-700">{sig.signer_address}</div>
                      </div>
                    )}
                    <div className="sm:col-span-2 pt-2 border-t border-gray-100">
                      <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Tijdstip van ondertekening</div>
                      <div className="font-medium text-gray-900">{formatDateTime(sig.signed_at)}</div>
                    </div>
                    {sig.ip_address && (
                      <div>
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">IP-adres</div>
                        <div className="font-mono text-xs text-gray-600">{sig.ip_address}</div>
                      </div>
                    )}
                    {sig.user_agent && (
                      <div className="sm:col-span-2">
                        <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">Browser / apparaat</div>
                        <div className="text-xs text-gray-500 break-all">{sig.user_agent}</div>
                      </div>
                    )}
                  </div>

                  {/* Signature image */}
                  {sig.signature_url && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="text-xs text-gray-400 uppercase tracking-wider mb-2">Digitale handtekening</div>
                      <div className="inline-block border border-gray-200 rounded-xl bg-gray-50 p-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={sig.signature_url} alt="Handtekening" className="max-h-20 max-w-xs object-contain" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 3 — Audit trail */}
        {allEvents.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl mb-6 print:rounded-none print:border-gray-300 overflow-hidden">
            <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-200">
              <Clock className="h-4 w-4 text-gray-500" />
              <span className="font-semibold text-gray-800">Sectie 3 — Auditlogboek</span>
            </div>
            <div className="px-6 py-5">
              <div className="relative">
                <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-200" />
                <div className="space-y-4">
                  {allEvents.map((ev: { id: string; event_type: string; created_at: string; actor_email?: string | null }) => (
                    <div key={ev.id} className="flex items-start gap-4">
                      <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-400 bg-white shrink-0 mt-0.5 relative z-10" />
                      <div className="text-sm pb-1">
                        <div className="font-medium text-gray-900">
                          {EVENT_LABELS[ev.event_type] ?? ev.event_type}
                        </div>
                        {ev.actor_email && (
                          <div className="text-xs text-gray-400">{ev.actor_email}</div>
                        )}
                        <div className="text-xs text-gray-400 mt-0.5">{formatDateTime(ev.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section 4 — Legal declaration */}
        <div className="bg-white border border-gray-200 rounded-2xl mb-8 print:rounded-none print:border-gray-300 overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 bg-gray-50 border-b border-gray-200">
            <Monitor className="h-4 w-4 text-gray-500" />
            <span className="font-semibold text-gray-800">Sectie 4 — Juridische verklaring</span>
          </div>
          <div className="px-6 py-5 text-sm text-gray-600 space-y-3">
            <p>
              Dit addendum vormt het officieel ondertekeningsbewijs voor het contract &ldquo;{contract.title}&rdquo;
              (referentie: {referenceId}) en maakt er een onlosmakelijk onderdeel van uit.
            </p>
            <p>
              De digitale handtekening werd geplaatst via het beveiligde NextGenMedia klantportaal na vrije,
              geïnformeerde en ondubbelzinnige toestemming van de ondertekenaar. De identiteit van de
              ondertekenaar werd bevestigd via het geregistreerde e-mailadres en het toegangstoken dat exclusief
              aan de betrokken partij werd verstrekt.
            </p>
            <p>
              Deze digitale handtekening heeft dezelfde juridische geldigheid als een handgeschreven handtekening,
              conform de Belgische Wet van 21 juli 2016 betreffende de erkenning van gekwalificeerde
              vertrouwensdiensten en Verordening (EU) Nr. 910/2014 (eIDAS-verordening).
            </p>
            <p>
              Het contract dat door dit addendum wordt gedekt, mag na ondertekening niet worden gewijzigd.
              Eventuele wijzigingen vereisen een nieuwe contractversie met een nieuw addendum.
              De status van het originele contract wordt dan ingesteld op &ldquo;Vervangen&rdquo;.
            </p>
            <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between text-xs text-gray-400">
              <span>NextGenMedia · {referenceId}</span>
              <span>Addendum gegenereerd op {formatDate(new Date().toISOString())}</span>
            </div>
          </div>
        </div>

        {/* Signature blocks (for physical signing if needed) */}
        <div className="grid grid-cols-2 gap-8 mt-8 pt-8 border-t border-gray-300">
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-6">Voor NextGenMedia</div>
            <div className="border-b border-gray-400 mb-2 h-12" />
            <div className="text-xs text-gray-500">Naam &amp; handtekening</div>
          </div>
          <div>
            <div className="text-xs text-gray-400 uppercase tracking-wider mb-6">
              Voor {companyName ?? 'de klant'}
            </div>
            <div className="border-b border-gray-400 mb-2 h-12" />
            <div className="text-xs text-gray-500">Naam &amp; handtekening</div>
          </div>
        </div>

      </div>

      <style>{`
        @media print {
          body { background: white; font-size: 12px; }
          .print\\:hidden { display: none !important; }
        }
      `}</style>
    </div>
  )
}
