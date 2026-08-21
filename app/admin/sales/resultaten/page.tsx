export const dynamic = 'force-dynamic'

import { ResultsClient } from './results-client'

// Resultaten van de appointment setters: gebelde uren, afspraken, gewonnen
// deals, commissie en wat er uitbetaald moet worden.
export default function SalesResultsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Resultaten</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Gebelde uren, geboekte afspraken en verdiensten per maand.
        </p>
      </div>
      <ResultsClient />
    </div>
  )
}
