import { Suspense } from 'react'
import { TabNav } from './tab-nav'
import { PeriodFilter } from './period-filter'

export default function RevenueLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Prognose</h1>
        <p className="text-sm text-gray-500 mt-0.5">Het financiële overzicht: verwachte omzet, gefactureerd, kosten en winst.</p>
      </div>
      <Suspense fallback={<div className="h-10" />}>
        <TabNav />
      </Suspense>
      <Suspense fallback={<div className="h-14" />}>
        <PeriodFilter />
      </Suspense>
      {children}
    </div>
  )
}
