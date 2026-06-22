// Pure helpers voor het facturenpaneel (client-safe).

export const INVOICE_STATUSES = ['te_factureren', 'gefactureerd', 'betaald', 'geannuleerd'] as const
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

export const INVOICE_STATUS_LABEL: Record<string, string> = {
  te_factureren: 'Te factureren',
  gefactureerd: 'Gefactureerd',
  betaald: 'Betaald',
  geannuleerd: 'Geannuleerd',
}
export const INVOICE_STATUS_CLS: Record<string, string> = {
  te_factureren: 'bg-amber-100 text-amber-700',
  gefactureerd: 'bg-blue-100 text-blue-700',
  betaald: 'bg-green-100 text-green-700',
  geannuleerd: 'bg-gray-100 text-gray-500',
}

export const DEFAULT_VAT = 21

/** Bedrag incl. btw, op 2 decimalen. */
export function inclFromExcl(excl: number, vatPct: number): number {
  return Math.round(excl * (1 + vatPct / 100) * 100) / 100
}

const MONTHS_NL = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

/** 'YYYY-MM' → 'juni 2026' */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS_NL[(m - 1) % 12]} ${y}`
}

export function thisMonthYM(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function shiftYM(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Laatste kalenderdag van een maand → 'YYYY-MM-DD' (standaard facturatiedatum). */
export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  const d = new Date(y, m, 0) // dag 0 van volgende maand = laatste dag huidige
  return `${y}-${String(m).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Omzet → maandbedragen ────────────────────────────────────────────────────
export type RevenueEntry = {
  id: string
  client_id: string | null
  service_slug: string | null
  type: string                 // 'recurring' | 'one_time'
  title: string | null
  amount_per_month: number | null
  start_month: string | null   // date
  end_month: string | null     // date
  amount: number | null
  transaction_month: string | null
}

export type ExpandedRevenue = {
  revenue_id: string
  client_id: string | null
  service_slug: string | null
  amount_excl: number
  type: string
  title: string | null
}

const ym = (date: string | null) => (date ? date.slice(0, 7) : null)

/** Omzet (excl. btw) per omzetrecord voor een bepaalde maand 'YYYY-MM'. */
export function expandRevenueForMonth(entries: RevenueEntry[], month: string): ExpandedRevenue[] {
  const out: ExpandedRevenue[] = []
  for (const e of entries) {
    if (e.type === 'recurring') {
      const start = ym(e.start_month)
      const end = ym(e.end_month)
      if (!start) continue
      if (start <= month && (!end || month <= end)) {
        out.push({ revenue_id: e.id, client_id: e.client_id, service_slug: e.service_slug, amount_excl: Number(e.amount_per_month) || 0, type: 'recurring', title: e.title })
      }
    } else {
      if (ym(e.transaction_month) === month) {
        out.push({ revenue_id: e.id, client_id: e.client_id, service_slug: e.service_slug, amount_excl: Number(e.amount) || 0, type: 'one_time', title: e.title })
      }
    }
  }
  return out
}
