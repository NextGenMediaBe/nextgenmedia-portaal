// Productieplanning: batches met een contentperiode (3 maanden, cyclisch) en een
// shootmaand (standaard de maand vóór de contentstart). Alles cyclisch per 3 mnd.

import { MONTHS_NL } from '@/lib/lifecycle'

export type Batch = {
  id: string
  name: string
  color: string
  start_month: number   // 0-11, ankermaand contentperiode
  shoot_offset: number  // maanden vóór content = shoot
  sort_order: number
}

const mod = (n: number, m: number) => ((n % m) + m) % m

/** Shootmaand (0-11) van een batch. */
export function shootMonth(b: Batch): number {
  return mod(b.start_month - b.shoot_offset, 12)
}

/** Produceert deze batch (scripts→shoots→montage) in maand M? Elke 3 maanden. */
export function isProductionMonth(b: Batch, month: number): boolean {
  return mod(month - shootMonth(b), 3) === 0
}

/** Label van de eerstvolgende/huidige contentperiode rond maand M. */
export function contentPeriodLabel(b: Batch): string {
  const a = b.start_month
  return `${MONTHS_NL[mod(a, 12)].slice(0, 3)}–${MONTHS_NL[mod(a + 1, 12)].slice(0, 3)}–${MONTHS_NL[mod(a + 2, 12)].slice(0, 3)}`
}

/** Eerstvolgende shootmaand-datum (1e van die maand) vanaf nu. */
export function nextShootDate(b: Batch, from = new Date()): string {
  const cur = new Date(from.getFullYear(), from.getMonth(), 1)
  for (let i = 0; i < 12; i++) {
    if (isProductionMonth(b, cur.getMonth())) return cur.toISOString().slice(0, 10)
    cur.setMonth(cur.getMonth() + 1)
  }
  return cur.toISOString().slice(0, 10)
}

export const WEEKS: { n: number; title: string; tasks: string[] }[] = [
  { n: 1, title: 'Week 1', tasks: ['Statistieken bespreken', 'Intake / strategie review', 'Contentkalender opstellen', 'Scripts uitschrijven', 'Partnermeetings'] },
  { n: 2, title: 'Week 2', tasks: ['Scripts aanpassen', 'Feedback verwerken', 'Contentshoots'] },
  { n: 3, title: 'Week 3', tasks: ['Contentshoots', 'Contentproductie'] },
  { n: 4, title: 'Week 4', tasks: ['Contentproductie', 'Montage', 'Voorbereiding Metricool'] },
  { n: 5, title: 'Week 5', tasks: ['Laatste feedback verwerken', 'Definitief inplannen', 'ClickUp afvinken', 'Statistieken voorbereiden'] },
]

export const DEFAULT_BATCH_COLORS = ['#3b82f6', '#eab308', '#22c55e', '#a855f7', '#ef4444', '#06b6d4', '#f97316', '#ec4899']
