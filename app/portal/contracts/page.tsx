import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'
import { FileText, CheckCircle2, Download, Eye, ExternalLink, Clock } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function PortalContractsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: client } = await supabase
    .from('clients').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (!client) redirect('/portal')

  const admin = createAdminSupabaseClient()

  const { data: contractsRaw } = await admin
    .from('contracts')
    .select('id, title, status, signed_at, sent_at, created_at, access_token, pdf_path, signed_pdf_path')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })

  const contracts = await Promise.all(
    (contractsRaw ?? []).map(async (c) => {
      // Signed PDF (with signature embedded)
      let signedPdfUrl: string | null = null
      if (c.signed_pdf_path) {
        const { data } = await admin.storage
          .from('contracts')
          .createSignedUrl(c.signed_pdf_path, 3600)
        signedPdfUrl = data?.signedUrl ?? null
      }
      // Original PDF (for viewing before/after signing)
      let originalPdfUrl: string | null = null
      if (c.pdf_path) {
        const { data } = await admin.storage
          .from('contracts')
          .createSignedUrl(c.pdf_path, 3600)
        originalPdfUrl = data?.signedUrl ?? null
      }
      return { ...c, signedPdfUrl, originalPdfUrl }
    })
  )

  const pendingContracts = contracts.filter((c) => ['sent', 'viewed'].includes(c.status))
  const signedContracts = contracts.filter((c) => c.status === 'signed')
  const otherContracts = contracts.filter((c) => !['sent', 'viewed', 'signed'].includes(c.status))

  const STATUS_MAP: Record<string, { cls: string; label: string }> = {
    draft:      { cls: 'bg-gray-100 text-gray-500',    label: 'Concept' },
    sent:       { cls: 'bg-amber-100 text-amber-700',  label: 'Wacht op handtekening' },
    viewed:     { cls: 'bg-amber-100 text-amber-700',  label: 'Bekeken' },
    signed:     { cls: 'bg-green-100 text-green-700',  label: 'Getekend' },
    expired:    { cls: 'bg-red-100 text-red-700',      label: 'Verlopen' },
    cancelled:  { cls: 'bg-gray-100 text-gray-400',    label: 'Geannuleerd' },
    vervangen:  { cls: 'bg-orange-100 text-orange-700', label: 'Vervangen' },
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Contracten</h1>
        <p className="text-sm text-gray-500 mt-0.5">Overzicht van uw contracten</p>
      </div>

      {contracts.length === 0 ? (
        <div className="card-base text-center py-12 text-gray-400">
          <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">Nog geen contracten beschikbaar</p>
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── Pending: sign now ── */}
          {pendingContracts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" />
                Wacht op uw handtekening ({pendingContracts.length})
              </h2>
              <div className="space-y-3">
                {pendingContracts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-4 p-4 rounded-xl border-2 border-[#fff848] bg-[#fff848]/5"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-amber-100">
                        <FileText className="h-5 w-5 text-amber-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{c.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {c.sent_at ? `Verstuurd op ${formatDate(c.sent_at)}` : formatDate(c.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {c.originalPdfUrl && (
                        <a
                          href={c.originalPdfUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-secondary text-xs"
                          title="Bekijk contract"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Bekijken
                        </a>
                      )}
                      <Link
                        href={`/sign/${c.access_token}`}
                        className="btn-primary text-xs"
                      >
                        ✍️ Ondertekenen
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Signed contracts ── */}
          {signedContracts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Ondertekende contracten ({signedContracts.length})
              </h2>
              <div className="space-y-3">
                {signedContracts.map((c) => {
                  const viewUrl = c.signedPdfUrl ?? c.originalPdfUrl
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-4 p-4 rounded-xl border border-gray-200 bg-white"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 bg-green-100">
                          <CheckCircle2 className="h-5 w-5 text-green-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold truncate">{c.title}</div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {c.signed_at ? `Getekend op ${formatDate(c.signed_at)}` : formatDate(c.created_at)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {viewUrl && (
                          <a
                            href={viewUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-secondary text-xs"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Bekijken
                          </a>
                        )}
                        {c.signedPdfUrl && (
                          <a
                            href={c.signedPdfUrl}
                            download
                            className="btn-secondary text-xs"
                          >
                            <Download className="h-3.5 w-3.5" />
                            Downloaden
                          </a>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* ── Other (draft / cancelled / expired) ── */}
          {otherContracts.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-gray-500 mb-2">Overige</h2>
              <div className="space-y-2">
                {otherContracts.map((c) => {
                  const style = STATUS_MAP[c.status] ?? STATUS_MAP.draft
                  return (
                    <div
                      key={c.id}
                      className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl border border-gray-100 bg-white"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-4 w-4 text-gray-300 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate text-gray-500">{c.title}</div>
                          <div className="text-xs text-gray-400">{formatDate(c.created_at)}</div>
                        </div>
                      </div>
                      <span className={`status-badge ${style.cls} shrink-0`}>{style.label}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

        </div>
      )}
    </div>
  )
}
