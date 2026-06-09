export const dynamic = 'force-dynamic'

import { formatEuro } from '@/lib/utils'
import { TrendingUp, TrendingDown, Wallet, Percent, Landmark, Users, Banknote, PiggyBank } from 'lucide-react'
import { loadCore, readPeriodParams } from '@/lib/finance-data'
import { Kpi, SectionTitle } from './kpi'

export default async function CeoOverviewPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const { year } = readPeriodParams(await searchParams)
  const c = await loadCore(year)
  const now = new Date()
  const curM = now.getMonth()
  const curQ = Math.floor(curM / 3)
  const qFrom = curQ * 3, qTo = qFrom + 2

  const sumOmzet = (a: number, b: number) => c.monthly.slice(a, b + 1).reduce((s, m) => s + m.omzet, 0)
  const sumKost = (a: number, b: number) => c.monthly.slice(a, b + 1).reduce((s, m) => s + m.kostenManual + c.socialPerMonth, 0)

  const omzetM = c.monthly[curM]?.omzet ?? 0
  const omzetQ = sumOmzet(qFrom, qTo)
  const kostM = (c.monthly[curM]?.kostenManual ?? 0) + c.socialPerMonth
  const kostQ = sumKost(qFrom, qTo)
  const kostFY = c.kostenManualFY + c.socialAsCostFY

  const brutoMarge = c.omzetFY > 0 ? (c.ebitdaFY / c.omzetFY) * 100 : 0
  const nettoMarge = c.omzetFY > 0 ? (c.netFY / c.omzetFY) * 100 : 0

  const cashOp = Number(c.settings.cash_on_account)
  const btwReserve = cashOp * (Number(c.settings.cash_reserve_pct) / 100)
  const beschikbaar = cashOp - btwReserve

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
          <Kpi label={`Boekjaar ${year} (voor belasting)`} value={formatEuro(c.winstFY)} color={c.winstFY >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionTitle>Marges (boekjaar)</SectionTitle>
          <div className="grid grid-cols-2 gap-4">
            <Kpi label="Brutomarge" value={`${brutoMarge.toFixed(1)}%`} sub="vóór sociale bijdr./belasting" color={brutoMarge >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Percent} />
            <Kpi label="Nettomarge" value={`${nettoMarge.toFixed(1)}%`} sub="na belasting" color={nettoMarge >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Percent} />
          </div>
        </div>
        <div>
          <SectionTitle>Cash</SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Kpi label="Cash op rekening" value={formatEuro(cashOp)} Icon={Banknote} />
            <Kpi label="Beschikbare cash" value={formatEuro(beschikbaar)} sub={`na ${c.settings.cash_reserve_pct}% reserve`} color="text-green-600" Icon={PiggyBank} />
            <Kpi label="BTW-reserve" value={formatEuro(btwReserve)} color="text-amber-600" Icon={PiggyBank} />
          </div>
        </div>
      </div>

      <div>
        <SectionTitle>Fiscale indicatie (boekjaar)</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi label="Vennootschapsbelasting" value={formatEuro(c.taxFY)} color="text-red-600" Icon={Landmark} />
          <Kpi label="Sociale bijdragen" value={formatEuro(c.socialAnnual)} color="text-red-600" Icon={Users} />
          <Kpi label="Nettowinst na belasting" value={formatEuro(c.netFY)} color={c.netFY >= 0 ? 'text-green-600' : 'text-red-600'} Icon={Wallet} />
        </div>
      </div>

      <p className="text-[11px] text-gray-400 italic">
        Indicatieve berekeningen op basis van de instelbare fiscale parameters (tab Instellingen). Geen officiële fiscale of boekhoudkundige rapportering — raadpleeg steeds uw boekhouder.
      </p>
    </div>
  )
}
