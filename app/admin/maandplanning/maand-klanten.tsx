import { formatDate } from '@/lib/utils'
import { Users, CalendarClock, FileWarning } from 'lucide-react'
import { loadActiveSocialLifecycles } from '@/lib/lifecycle-data'
import { MONTHS_NL, type ClientLifecycle } from '@/lib/lifecycle'

const PHASES = [
  { label: 'Contentkalender & Scripts', days: '1–2', chip: 'bg-yellow-100 text-yellow-800 border-yellow-300' },
  { label: 'Intakes & Klantmeetings', days: '3–5', chip: 'bg-blue-100 text-blue-700 border-blue-200' },
  { label: 'Contentshoots', days: '6–13', chip: 'bg-purple-100 text-purple-700 border-purple-200' },
  { label: 'Editen & Metricool', days: '11–18', chip: 'bg-green-100 text-green-700 border-green-200' },
  { label: 'Feedback verwerken', days: '19–22', chip: 'bg-red-100 text-red-700 border-red-200' },
  { label: 'Rapportering', days: '23', chip: 'bg-gray-900 text-white border-gray-900' },
]

function contractStatus(lc: ClientLifecycle): string {
  if (lc.daysUntilEnd == null) return 'Actief'
  if (lc.daysUntilEnd < 0) return 'Verlopen'
  if (lc.daysUntilEnd <= 30) return 'Loopt af'
  if (lc.daysUntilEnd <= 60) return 'Verlenging nodig'
  return 'Actief'
}
function nextAction(lc: ClientLifecycle): string {
  if (lc.reviewThisMonth) return 'Strategie review'
  if (lc.daysUntilEnd != null && lc.daysUntilEnd <= 60) return 'Contractverlenging'
  return 'Content cyclus'
}

function ClientChip({ lc }: { lc: ClientLifecycle }) {
  const tip = `${lc.companyName}\nBatch: ${lc.batch ?? '—'}\nDienst: Social Media\nContract: ${contractStatus(lc)}\nVolgende actie: ${nextAction(lc)}`
  return (
    <span title={tip} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-gray-200 bg-white text-xs hover:border-gray-300">
      {lc.companyName}
      {lc.batch && <span className="text-[10px] text-gray-400">·{lc.batch.slice(0, 3)}</span>}
      {lc.reviewThisMonth && <span className="h-1.5 w-1.5 rounded-full bg-purple-500" title="Strategie review deze maand" />}
      {lc.daysUntilEnd != null && lc.daysUntilEnd <= 60 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title="Contract loopt af" />}
    </span>
  )
}

export async function MaandKlanten() {
  const clients = await loadActiveSocialLifecycles()
  const now = new Date()
  const reviews = clients.filter(c => c.reviewThisMonth)
  const renewals = clients.filter(c => c.daysUntilEnd != null && c.daysUntilEnd <= 60).sort((a, b) => (a.daysUntilEnd ?? 0) - (b.daysUntilEnd ?? 0))

  if (clients.length === 0) {
    return <div className="card-base text-sm text-gray-400 text-center py-6">Nog geen actieve Social Media-klanten</div>
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4 text-gray-400" />Klanten per fase — {MONTHS_NL[now.getMonth()]} {now.getFullYear()}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{clients.length} actieve contentklanten · elke klant doorloopt de volledige maandcyclus · paars = review deze maand, oranje = contract loopt af</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {PHASES.map(p => (
          <div key={p.label} className="card-base">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium text-sm flex items-center gap-2"><span className={`text-[10px] px-2 py-0.5 rounded-full border ${p.chip}`}>Werkdag {p.days}</span>{p.label}</div>
              <span className="text-xs text-gray-400">{clients.length} klanten</span>
            </div>
            <div className="flex flex-wrap gap-1.5">{clients.map(c => <ClientChip key={c.clientId} lc={c} />)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-base">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><CalendarClock className="h-4 w-4 text-purple-500" />Strategie review deze maand <span className="status-badge bg-purple-100 text-purple-700 text-xs">{reviews.length}</span></h3>
          {reviews.length === 0 ? <p className="text-sm text-gray-400">Geen reviews deze maand</p> : (
            <div className="flex flex-wrap gap-1.5">{reviews.map(c => <ClientChip key={c.clientId} lc={c} />)}</div>
          )}
        </div>
        <div className="card-base">
          <h3 className="font-semibold text-sm flex items-center gap-2 mb-3"><FileWarning className="h-4 w-4 text-amber-500" />Contractverlenging nodig <span className="status-badge bg-amber-100 text-amber-700 text-xs">{renewals.length}</span></h3>
          {renewals.length === 0 ? <p className="text-sm text-gray-400">Geen contracten lopen binnenkort af</p> : (
            <div className="space-y-1.5">
              {renewals.map(c => (
                <div key={c.clientId} className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.companyName} <span className="text-xs text-gray-400">· Batch {c.batch ?? '—'}</span></span>
                  <span className={`text-xs ${(c.daysUntilEnd ?? 0) <= 14 ? 'text-red-600' : 'text-amber-600'}`}>{c.endDate ? formatDate(c.endDate) : '—'} ({c.daysUntilEnd}d)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
