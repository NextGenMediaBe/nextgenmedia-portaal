// Instelbare fiscale parameters per boekjaar + pure (indicatieve) berekeningen.
// GEEN hardcoded percentages in de business logic: alle waarden komen uit
// FiscalSettings, die admin per boekjaar kan aanpassen. De defaults hieronder
// zijn publieke richtwaarden (BE) en bewust wijzigbaar.

export type FiscalSettings = {
  year: number
  // Vennootschapsbelasting
  corporate_tax_pct: number      // standaardtarief %
  reduced_tax_pct: number        // verlaagd tarief % (eerste schijf)
  reduced_tax_limit: number      // grens verlaagd tarief (€)
  // Sociale bijdragen (zelfstandige / zaakvoerder)
  social_pct_band1: number       // % schijf 1
  social_pct_band2: number       // % schijf 2
  income_band1_limit: number     // inkomensgrens schijf 1 (€)
  income_band2_limit: number     // inkomensgrens schijf 2 (€)
  mgmt_fee_pct: number           // beheerskost sociaal verzekeringsfonds %
  min_quarter: number            // minimum kwartaalbijdrage (€)
  max_quarter: number            // maximum kwartaalbijdrage (€)
  extra_pct: number              // aanvullend % (optioneel)
  extra_fixed: number            // aanvullend vast bedrag per jaar (€)
  // Loon / bezoldiging
  salary_gross_monthly: number   // bruto bezoldiging per maand (€)
  salary_months: number          // aantal maanden
  statuut: string                // bv. 'zaakvoerder'
  include_social_as_cost: boolean // sociale bijdragen meenemen als kost in rapportage
}

/** Publieke richtwaarden — bewust aanpasbaar per boekjaar. */
export function defaultFiscalSettings(year: number): FiscalSettings {
  return {
    year,
    corporate_tax_pct: 25,
    reduced_tax_pct: 20,
    reduced_tax_limit: 100000,
    social_pct_band1: 20.5,
    social_pct_band2: 14.16,
    income_band1_limit: 75000,
    income_band2_limit: 115000,
    mgmt_fee_pct: 3.05,
    min_quarter: 870,
    max_quarter: 5000,
    extra_pct: 0,
    extra_fixed: 0,
    salary_gross_monthly: 0,
    salary_months: 12,
    statuut: 'zaakvoerder',
    include_social_as_cost: false,
  }
}

/** Vul ontbrekende velden van een (deels) opgeslagen rij aan met defaults. */
export function mergeFiscalSettings(year: number, row: Partial<FiscalSettings> | null | undefined): FiscalSettings {
  const d = defaultFiscalSettings(year)
  if (!row) return d
  const out = { ...d }
  for (const k of Object.keys(d) as (keyof FiscalSettings)[]) {
    const v = row[k]
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v
  }
  out.year = year
  return out
}

/** Indicatieve vennootschapsbelasting: verlaagd tarief tot de grens, daarboven standaard. */
export function estimateCorporateTax(profitBeforeTax: number, s: FiscalSettings): number {
  if (profitBeforeTax <= 0) return 0
  const reducedPart = Math.min(profitBeforeTax, s.reduced_tax_limit)
  const standardPart = Math.max(0, profitBeforeTax - s.reduced_tax_limit)
  return reducedPart * (s.reduced_tax_pct / 100) + standardPart * (s.corporate_tax_pct / 100)
}

/** Indicatieve sociale bijdragen (zelfstandige) op een jaarinkomen. */
export function estimateSocialContribution(annualIncome: number, s: FiscalSettings): { annual: number; perQuarter: number } {
  if (annualIncome <= 0) return { annual: 0, perQuarter: 0 }
  const p1 = Math.min(annualIncome, s.income_band1_limit) * (s.social_pct_band1 / 100)
  const p2 = Math.max(0, Math.min(annualIncome, s.income_band2_limit) - s.income_band1_limit) * (s.social_pct_band2 / 100)
  let base = p1 + p2
  base += base * (s.mgmt_fee_pct / 100)            // beheerskost fonds
  base += base * (s.extra_pct / 100) + s.extra_fixed // aanvullend
  let perQuarter = base / 4
  perQuarter = Math.min(Math.max(perQuarter, s.min_quarter), s.max_quarter)
  return { annual: perQuarter * 4, perQuarter }
}
