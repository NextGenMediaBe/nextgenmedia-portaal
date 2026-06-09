import { createAdminSupabaseClient } from '@/lib/supabase/server'
import {
  mergeFiscalSettings, estimateCorporateTax, estimateSocialContribution,
  revenueForMonth, costForMonth, currentMRR, currentRecurringCost, remainingRecurringRevenue,
  type RevenueEntry, type CostEntry, type FiscalSettings,
} from '@/lib/finance'

export type FinanceCore = {
  settings: FiscalSettings
  entries: RevenueEntry[]
  costs: CostEntry[]
  clientMap: Map<string, string>
  year: number
  monthly: { mi: number; omzet: number; omzetRec: number; omzetOne: number; kostenManual: number }[]
  omzetFY: number; omzetRecFY: number; omzetOneFY: number
  kostenManualFY: number; ebitdaFY: number
  jaarloon: number; socialAnnual: number; socialPerQuarter: number
  socialAsCostFY: number; socialPerMonth: number
  winstFY: number; taxFY: number; netFY: number
  mrr: number; recurringCostNow: number; remainingRecurring: number
}

export function computeCore(entries: RevenueEntry[], costs: CostEntry[], settings: FiscalSettings, year: number, clientMap: Map<string, string>): FinanceCore {
  const monthly = Array.from({ length: 12 }, (_, mi) => {
    const r = revenueForMonth(entries, year, mi)
    return { mi, omzet: r.recurring + r.one_time, omzetRec: r.recurring, omzetOne: r.one_time, kostenManual: costForMonth(costs, year, mi) }
  })
  const omzetFY = monthly.reduce((s, m) => s + m.omzet, 0)
  const omzetRecFY = monthly.reduce((s, m) => s + m.omzetRec, 0)
  const omzetOneFY = monthly.reduce((s, m) => s + m.omzetOne, 0)
  const kostenManualFY = monthly.reduce((s, m) => s + m.kostenManual, 0)
  const ebitdaFY = omzetFY - kostenManualFY

  const jaarloon = Number(settings.salary_gross_monthly) * Number(settings.salary_months)
  const social = estimateSocialContribution(jaarloon, settings)
  const socialAsCostFY = settings.include_social_as_cost ? social.annual : 0
  const socialPerMonth = socialAsCostFY / 12

  const winstFY = ebitdaFY - socialAsCostFY
  const taxFY = estimateCorporateTax(winstFY, settings)
  const netFY = winstFY - taxFY

  return {
    settings, entries, costs, clientMap, year, monthly,
    omzetFY, omzetRecFY, omzetOneFY, kostenManualFY, ebitdaFY,
    jaarloon, socialAnnual: social.annual, socialPerQuarter: social.perQuarter,
    socialAsCostFY, socialPerMonth, winstFY, taxFY, netFY,
    mrr: currentMRR(entries), recurringCostNow: currentRecurringCost(costs),
    remainingRecurring: remainingRecurringRevenue(entries),
  }
}

export async function loadCore(year: number): Promise<FinanceCore> {
  const admin = createAdminSupabaseClient()
  const [{ data: entries }, { data: clients }, { data: costs }, { data: fiscalRow }] = await Promise.all([
    admin.from('revenue_entries').select('*').order('created_at', { ascending: false }),
    admin.from('clients').select('id, company_name').is('archived_at', null),
    admin.from('cost_entries').select('*').order('created_at', { ascending: false }),
    admin.from('fiscal_settings').select('*').eq('year', year).maybeSingle(),
  ])
  const settings = mergeFiscalSettings(year, fiscalRow)
  const clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name]))
  return computeCore((entries ?? []) as RevenueEntry[], (costs ?? []) as CostEntry[], settings, year, clientMap)
}

// Periode → maandindexen (0-based, inclusief)
export function periodRange(period: 'month' | 'quarter' | 'fy', quarter: number, month: number): [number, number] {
  if (period === 'month') return [month - 1, month - 1]
  if (period === 'quarter') return [(quarter - 1) * 3, (quarter - 1) * 3 + 2]
  return [0, 11]
}

export function readPeriodParams(sp: Record<string, string>) {
  const now = new Date()
  const year = Number(sp.fy) || now.getFullYear()
  const period = (['month', 'quarter', 'fy'].includes(sp.period) ? sp.period : 'fy') as 'month' | 'quarter' | 'fy'
  const quarter = Math.min(4, Math.max(1, Number(sp.q) || (Math.floor(now.getMonth() / 3) + 1)))
  const month = Math.min(12, Math.max(1, Number(sp.mo) || (now.getMonth() + 1)))
  return { year, period, quarter, month }
}

export const MONTHS = ['Jan', 'Feb', 'Mrt', 'Apr', 'Mei', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec']
export const PERIOD_LABEL: Record<string, string> = { month: 'Maand', quarter: 'Kwartaal', fy: 'Boekjaar' }
