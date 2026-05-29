import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { FileText } from 'lucide-react'
import { SignatureForm } from './signature-form'

export default async function SignContractPage({ params }: { params: { token: string } }) {
  const admin = createAdminSupabaseClient()

  // Use select('*') — never errors on missing columns, safe regardless of schema
  const { data: contract, error } = await admin
    .from('contracts')
    .select('*')
    .eq('access_token', params.token)
    .maybeSingle()

  if (error) {
    console.error('[sign page] contract lookup error:', error.message, '| token:', params.token)
  }
  if (!contract) {
    console.error('[sign page] contract not found for token:', params.token)
    notFound()
  }

  // Fetch client name separately — best effort
  let companyName: string | null = null
  if (contract.client_id) {
    const { data: clientRow } = await admin
      .from('clients')
      .select('company_name')
      .eq('id', contract.client_id)
      .maybeSingle()
    companyName = clientRow?.company_name ?? null
  }

  const alreadySigned = contract.status === 'signed'

  let pdfUrl: string | null = null
  if (contract.pdf_path) {
    const { data: signData } = await admin.storage
      .from('contracts')
      .createSignedUrl(contract.pdf_path, 3600)
    pdfUrl = signData?.signedUrl ?? null
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-gray-900 flex items-center justify-center">
            <span className="font-bold text-white text-xs">N</span>
          </div>
          <span className="font-bold text-sm">NextGenMedia</span>
        </div>
        <span className="text-xs text-gray-400">Contractondertekening</span>
      </header>

      <div className="flex-1 max-w-4xl mx-auto w-full px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{contract.title}</h1>
          {companyName && (
            <p className="text-sm text-gray-500 mt-0.5">{companyName}</p>
          )}
        </div>

        {alreadySigned ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
            <div className="h-12 w-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <FileText className="h-6 w-6 text-green-600" />
            </div>
            <h2 className="font-semibold text-green-800 mb-1">Contract reeds ondertekend</h2>
            <p className="text-sm text-green-700">Dit contract is al ondertekend. U kunt het PDF-document hieronder bekijken.</p>
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            <p>Lees het contract aandachtig door en vul uw gegevens in om digitaal te ondertekenen.</p>
          </div>
        )}

        {/* PDF viewer */}
        {pdfUrl && (
          <div className="card-base p-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-gray-400" />
              <span className="text-sm font-medium">Contractdocument</span>
              <a href={pdfUrl} target="_blank" rel="noopener noreferrer" className="ml-auto text-xs text-gray-400 hover:text-black">
                Openen in nieuw tabblad ↗
              </a>
            </div>
            <iframe
              src={pdfUrl}
              className="w-full"
              style={{ height: '60vh' }}
              title="Contract PDF"
            />
          </div>
        )}

        {/* Signature form */}
        {!alreadySigned && (
          <SignatureForm
            contractId={contract.id}
            token={params.token}
            defaultName={contract.signer_name ?? ''}
            defaultEmail={contract.signer_email ?? ''}
          />
        )}
      </div>
    </div>
  )
}
