import { FileText } from 'lucide-react'

// Toont actieve voorwaarden/akkoorden voor een dashboard (read-only).
export function TermsCard({ terms }: { terms: { id: string; title: string; content: string | null }[] }) {
  if (!terms || terms.length === 0) return null
  return (
    <div className="card-base">
      <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-gray-400" />Voorwaarden &amp; akkoorden</h2>
      <div className="space-y-2">
        {terms.map((t) => (
          <details key={t.id} className="rounded-lg border border-gray-100 p-3">
            <summary className="cursor-pointer text-sm font-medium">{t.title}</summary>
            {t.content && <div className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{t.content}</div>}
          </details>
        ))}
      </div>
    </div>
  )
}
