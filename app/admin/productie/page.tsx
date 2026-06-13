export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, Radio, Database } from 'lucide-react'
import { MONTHS_NL } from '@/lib/lifecycle'
import { WEEKS, isProductionMonth, nextShootDate, contentPeriodLabel } from '@/lib/production'
import { loadProduction, defaultBatchFor, type ProductionClient } from '@/lib/production-data'
import { nextReportingDate } from '@/lib/lifecycle-data'
import { isReviewMonth } from '@/lib/lifecycle'
import { BatchManager } from './batch-manager'
import { ProductionChip, type ChipDetail } from './production-chip'

function contractStatus(c: ProductionClient): { label: string; cls: string } {
  if (c.daysUntilEnd == null) return { label: 'Lopend', cls: 'bg-gray-100 text-gray-600' }
  if (c.daysUntilEnd < 0) return { label: 'Verlopen', cls: 'bg-red-100 text-red-700' }
  if (c.daysUntilEnd <= 30) return { label: `${c.daysUntilEnd}d resterend`, cls: 'bg-amber-100 text-amber-700' }
  if (c.daysUntilEnd <= 60) return { label: `${c.daysUntilEnd}d resterend`, cls: 'bg-yellow-50 text-yellow-700' }
  return { label: 'Actief', cls: 'bg-green-100 text-green-700' }
}

export default async function ProductiePage({ searchParams }: { searchParams: { m?: string } }) {
  const now = new Date()
  const parsed = /^\d{4}-\d{2}$/.test(searchParams.m ?? '') ? searchParams.m!.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1]
  const year = parsed[0]
  const month = parsed[1] - 1 // 0-11
  const cursor = new Date(year, month, 1)

  const { batches, clients, migrated } = await loadProduction(now)
  const reporting = nextReportingDate(now)

  // Chip-detail per klant
  const detailOf = (c: ProductionClient): ChipDetail => {
    const b = defaultBatchFor(c, batches)
    const cs = contractStatus(c)
    return {
      clientId: c.clientId, name: c.companyName, color: b?.color ?? null, batchName: b?.name ?? null,
      contractStatus: cs.label, contractStatusColor: cs.cls,
      nextShoot: b ? nextShootDate(b, now) : null, nextReview: c.nextReview, nextReporting: reporting,
    }
  }

  // Buckets voor de getoonde maand
  const inProduction = clients.filter((c) => { const b = defaultBatchFor(c, batches); return b && isProductionMonth(b, month) })
  const reviewClients = clients.filter((c) => isReviewMonth(c.startDate, year, month))
  const liveClients = clients.filter((c) => !inProduction.includes(c))

  // Welke klanten horen bij een taak?
  const taskClients = (label: string): ProductionClient[] => {
    const l = label.toLowerCase()
    if (l.includes('intake') || l.includes('review') || l.includes('statistieken bespreken')) return reviewClients
    if (l.includes('script') || l.includes('contentkalender')) return inProduction
    if (l.includes('shoot')) return inProduction
    if (l.includes('productie') || l.includes('montage') || l.includes('metricool')) return inProduction
    if (l.includes('feedback') || l.includes('inplannen') || l.includes('clickup') || l.includes('statistieken voorbereiden')) return inProduction
    return []
  }

  const prev = new Date(year, month - 1, 1)
  const next = new Date(year, month + 1, 1)
  const mq = (d: Date) => `?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Productieplanning</h1>
          <p className="mt-0.5 text-sm text-gray-500">Klantgebonden productie per maand — automatisch uit batch, contract & reviewcyclus.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={mq(prev)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[150px] text-center text-sm font-semibold">{MONTHS_NL[month]} {year}</span>
          <Link href={mq(next)} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></Link>
        </div>
      </div>

      {!migrated && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <Database className="h-4 w-4 shrink-0" />
          Batchtabel nog niet aangemaakt — voer <code className="rounded bg-amber-100 px-1">99999999_SYNC_ALL.sql</code> uit in Supabase. Tot dan kan je geen batches beheren.
        </div>
      )}

      {/* Maand-overzicht */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="card-base">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><CalendarDays className="h-3.5 w-3.5 text-purple-500" />In productie deze maand</div>
          <div className="mt-1 text-xl font-bold">{inProduction.length}</div>
          <div className="text-[11px] text-gray-400">klanten met shoot/scripts/montage</div>
        </div>
        <div className="card-base">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><CalendarDays className="h-3.5 w-3.5 text-blue-500" />Strategie reviews</div>
          <div className="mt-1 text-xl font-bold">{reviewClients.length}</div>
          <div className="text-[11px] text-gray-400">elke 3 maanden per klant</div>
        </div>
        <div className="card-base">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500"><Radio className="h-3.5 w-3.5 text-green-500" />Content live</div>
          <div className="mt-1 text-xl font-bold">{liveClients.length}</div>
          <div className="text-[11px] text-gray-400">lopende content, geen productie</div>
        </div>
      </div>

      {/* Week-fases */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {WEEKS.map((w) => (
          <div key={w.n} className="card-base">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-900 text-xs font-bold text-white">{w.n}</span>
              {w.title}
            </h3>
            <div className="space-y-2.5">
              {w.tasks.map((t) => {
                const cs = taskClients(t)
                return (
                  <div key={t}>
                    <div className="text-sm text-gray-700">{t}</div>
                    {cs.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        {cs.map((c) => <ProductionChip key={c.clientId} detail={detailOf(c)} />)}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Content live context */}
      {liveClients.length > 0 && (
        <div className="card-base">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900"><Radio className="h-4 w-4 text-green-500" />Content live deze maand (geen actieve productie)</h3>
          <div className="flex flex-wrap gap-1.5">
            {liveClients.map((c) => <ProductionChip key={c.clientId} detail={detailOf(c)} />)}
          </div>
        </div>
      )}

      {/* Batchbeheer */}
      <BatchManager
        batches={batches}
        clients={clients.map((c) => ({ id: c.clientId, name: c.companyName, batchId: c.batchId, batchMonth: c.batchMonth }))}
      />
    </div>
  )
}
