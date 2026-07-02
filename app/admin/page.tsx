export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { TodayPanel } from './today-panel'
import { ContractsWidget } from './contracts-widget'
import { RecentActivity } from './recent-activity'

// Compact Command Center: Vandaag (acties) + kritieke contracten + recente
// activiteit. Notificaties leven in het globale belletje. De zware module-
// widgets (finance/lifecycle/blogs/framer/scripts) zijn verplaatst naar hun
// eigen modules — niet verwijderd, enkel niet meer op het dashboard.
export default function CommandCenter() {
  const today = new Date()
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Command Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {today.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Vandaag — dagelijkse acties (de werkplek) */}
      <Suspense fallback={<div className="card-base text-sm text-gray-400">Vandaag laden…</div>}>
        <TodayPanel />
      </Suspense>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Kritieke contracten + opvolging */}
        <Suspense fallback={<div className="card-base text-sm text-gray-400">Contracten laden…</div>}>
          <ContractsWidget />
        </Suspense>

        {/* Recente activiteit */}
        <Suspense fallback={<div className="card-base text-sm text-gray-400">Activiteit laden…</div>}>
          <RecentActivity />
        </Suspense>
      </div>
    </div>
  )
}
