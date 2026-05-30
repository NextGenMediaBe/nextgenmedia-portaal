import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatEuro(amount: number | null | undefined): string {
  if (amount == null) return '—'
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function formatDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—'
  return new Date(dateStr).toLocaleDateString('nl-BE', {
    day: 'numeric',
    month: 'short',
  })
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const diff = new Date(dateStr).getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

// ── Partner commission helpers ──────────────────────────────────────────────
// Commission depends on how long the REFERRED client/job has been active,
// not on how long the person has been a partner. Year is 1-based.

export type CommissionDeal = {
  contract_value: number
  start_date: string
  pct_year_1: number
  pct_year_2: number
  pct_year_3: number
}

/** Which contract year a given date falls in, relative to the deal start (1-based). */
export function commissionYearForDate(startDate: string, when: Date = new Date()): number {
  const start = new Date(startDate + 'T00:00:00')
  let years = when.getFullYear() - start.getFullYear()
  // Has this year's anniversary passed yet?
  const anniv = new Date(start)
  anniv.setFullYear(start.getFullYear() + years)
  if (when < anniv) years -= 1
  return Math.max(1, years + 1)
}

/** Commission % for a given (1-based) contract year. Year 4+ keeps year-3 rate. */
export function commissionPctForYear(deal: Pick<CommissionDeal, 'pct_year_1' | 'pct_year_2' | 'pct_year_3'>, year: number): number {
  if (year <= 1) return Number(deal.pct_year_1)
  if (year === 2) return Number(deal.pct_year_2)
  return Number(deal.pct_year_3)
}

/** Commission amount owed for a given contract year. */
export function commissionAmountForYear(deal: CommissionDeal, year: number): number {
  const pct = commissionPctForYear(deal, year)
  return Math.round((Number(deal.contract_value) * pct) / 100 * 100) / 100
}

export function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export const SERVICE_LABELS: Record<string, string> = {
  'social-media': 'Social Media',
  'webdesign': 'Website',
  'marketing-consultancy': 'Marketing Consultancy',
  'grafisch-ontwerp': 'Grafisch Ontwerp',
  'ads': 'Google Advertising',
  'foto-video': 'Foto & Videografie',
}

export const SERVICE_SLUGS = [
  'social-media',
  'webdesign',
  'marketing-consultancy',
  'grafisch-ontwerp',
  'ads',
  'foto-video',
] as const

export type ServiceSlug = typeof SERVICE_SLUGS[number]

// ─── Webdesign change-request labels & helpers ─────────────────────────────
// Shared between the admin dashboard and the client portal so labels & status
// styling never drift between the two.

export const WEBDESIGN_STATUS_STYLE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-purple-100 text-purple-700',
  rejected: 'bg-red-100 text-red-700',
  done: 'bg-green-100 text-green-700',
  archived: 'bg-gray-200 text-gray-500',
}

export const WEBDESIGN_STATUS_LABEL: Record<string, string> = {
  new: 'Nieuw',
  in_progress: 'In behandeling',
  rejected: 'Afgewezen',
  done: 'Afgerond',
  archived: 'Gearchiveerd',
}

export const WEBDESIGN_KIND_LABEL: Record<string, string> = {
  text: 'Tekst',
  color: 'Kleur',
  image: 'Afbeelding',
  other: 'Overig',
  minor: 'Klein',
  major: 'Groot',
}

// The portal API stores the user-friendly kind in `categories[0]` (modern
// schema) and as a `[kind] ...` prefix in `description` (fallback for old
// schemas). This resolver picks the best available source.
const KIND_PREFIX_RE = /^\[([a-z_-]+)\]\s*([\s\S]*)$/i

export function resolveFriendlyKind(r: {
  kind?: string | null
  categories?: string[] | null
  description?: string | null
}): string {
  const fromCategories = Array.isArray(r.categories) && r.categories.length > 0 ? r.categories[0] : null
  if (fromCategories) return fromCategories
  const match = r.description?.match(KIND_PREFIX_RE)
  if (match) return match[1]
  return r.kind ?? 'other'
}

// Strip the leading `[kind]` prefix the portal adds to description as a
// fallback when the categories column doesn't exist.
export function cleanDescription(d: string | null | undefined): string | null {
  if (!d) return null
  const match = d.match(KIND_PREFIX_RE)
  const cleaned = (match ? match[2] : d).trim()
  return cleaned || null
}
