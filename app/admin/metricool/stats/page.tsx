export const dynamic = 'force-dynamic'

import { MetricoolStats } from './metricool-stats'

export default function MetricoolStatsPage() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Metricool — Statistieken</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Wat werkt per klant: performance per formaat, beste posttijd en topposts. Intern — niet zichtbaar voor klanten.
        </p>
      </div>
      <MetricoolStats />
    </div>
  )
}
