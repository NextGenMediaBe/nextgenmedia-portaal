export const dynamic = 'force-dynamic'

import { formatEuro } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import { loadCore, readPeriodParams } from '@/lib/finance-data'
import { Kpi, SectionTitle } from './kpi'

// Vereenvoudigde financiën: enkel Omzet, Kosten en Winst per maand/kwartaal/boekjaar.
// Geen werknemers, sociale bijdragen, vennootschapsbelasting, EBITDA, marges,
// aandeelhouders of cash-reserves meer.
export default async function FinanceOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { year } = readPeriodParams(await searchParams)
  const c = await loadCore(year)
  const now = new Date()
  const curM = now.getMonth()
  const curQ = Math.floor(curM / 3)
  const qFrom = curQ * 3, qTo = qFrom + 2

  const sumOmzet = (a: number, b: number) => c.monthly.slice(a, b + 1).reduce((s, m) => s + m.omzet, 0)
  // Kosten = enkel de manueel geregistreerde kosten (geen sociale bijdragen e.d.).
  const sumKost = (a: number, b: number) => c.monthly.slice(a, b + 1).reduce((s, m) => s + m.kostenManual, 0)

  const omzetM = c.monthly[curM]?.omzet ?? 0
  const omzetQ = sumOmzet(qFrom, qTo)
  const kostM = c.monthly[curM]?.kostenManual ?? 0
  const kostQ = sumKost(qFrom, qTo)
  const kostFY = c.kostenManualFY
  const winstFY = c.omzetFY - kostFY

  return (
    <div className="space-y-6">
      <div>
        <SectionTitle>Omzet</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Deze maand" value={formatEuro(omzetM)} color="text-green-600" Icon={TrendingUp} />
          <Kpi label="Dit kwartaal" value={formatEuro(omzetQ)} color="text-green-600" Icon={TrendingUp} />
          <Kpi label={`Boekjaar ${year}`} value={formatEuro(c.omzetFY)} color="text-green-600" Icon={TrendingUp} />
        </div>
      </div>

      <div>
        <SectionTitle>Kosten</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Deze maand" value={formatEuro(kostM)} color="text-red-600" Icon={TrendingDown} />
          <Kpi label="Dit kwartaal" value={formatEuro(kostQ)} color="text-red-600" Icon={TrendingDown} />
          <Kpi label={`Boekjaar ${year}`} value={formatEuro(kostFY)} color="text-red-600" Icon={TrendingDown} />
        </div>
      </div>

      <div>
        <SectionTitle>Winst</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Deze maand" value={formatEuro(omzetM - kostM)} color={omzetM - kostM >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
          <Kpi label="Dit kwartaal" value={formatEuro(omzetQ - kostQ)} color={omzetQ - kostQ >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
          <Kpi label={`Boekjaar ${year}`} value={formatEuro(winstFY)} color={winstFY >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
        </div>
      </div>

      <p className="text-[11px] text-gray-400 italic">
        Omzet en kosten per periode. Indicatief overzicht — geen officiële boekhoudkundige rapportering.
      </p>
    </div>
  )
}
