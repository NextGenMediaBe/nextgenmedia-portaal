import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { getOrCreateSalesOrg } from '@/lib/sales/service'
import {
  totalSeconds, earnedCents, monthKey, type Interval,
} from '@/lib/sales/earnings'

/**
 * Appointment setters: wie ze zijn, hoeveel ze werkten en wat ze verdienden.
 *
 * Een setter werkt op uurbasis plus commissie op het eerste contract. Beide
 * lopen per maand en worden apart afgerekend — dat zijn de twee afrekeningen
 * die het scherm toont.
 */

export type Setter = {
  id: string
  auth_user_id: string | null
  name: string
  email: string | null
  hourly_rate_cents: number
  commission_pct: number
  active: boolean
}

export type SetterStats = {
  setter: Setter
  /** Gewerkte tijd in seconden, inclusief een timer die nu loopt. */
  seconds: number
  earnedCents: number
  /** Loopt er op dit moment een timer, en sinds wanneer? */
  runningSince: string | null
  appointments: number
  won: number
  lost: number
  open: number
  /** Totale waarde van de gewonnen eerste contracten. */
  dealValueCents: number
  commissionCents: number
  totalCents: number
}

/**
 * Het setterprofiel van een ingelogde gebruiker; wordt aangemaakt zodra iemand
 * met de Verkoop-module voor het eerst zijn timer gebruikt. Zo hoeft niemand
 * eerst handmatig een profiel aan te maken voor er gewerkt kan worden.
 */
export async function getOrCreateSetter(
  authUserId: string, name: string, email: string | null,
): Promise<Setter | null> {
  const admin = createAdminSupabaseClient()
  const org = await getOrCreateSalesOrg()

  const { data: existing } = await admin.from('sales_setters')
    .select('*').eq('auth_user_id', authUserId).maybeSingle()
  if (existing) return existing as Setter

  const { data: created, error } = await admin.from('sales_setters').insert({
    sales_client_id: org.id,
    auth_user_id: authUserId,
    name: name || email || 'Appointment setter',
    email,
  }).select('*').single()
  if (error) {
    // Race: twee gelijktijdige verzoeken van dezelfde persoon. De unieke index
    // vangt dat af; we halen dan gewoon het bestaande profiel op.
    const { data: again } = await admin.from('sales_setters')
      .select('*').eq('auth_user_id', authUserId).maybeSingle()
    return (again as Setter) ?? null
  }
  return created as Setter
}

export async function listSetters(): Promise<Setter[]> {
  const admin = createAdminSupabaseClient()
  const org = await getOrCreateSalesOrg()
  const { data } = await admin.from('sales_setters')
    .select('*').eq('sales_client_id', org.id).order('name')
  return (data ?? []) as Setter[]
}

export type Period = { from: Date; to: Date }

/** De maand waarin `d` valt, van de eerste dag tot en met de laatste. */
export function monthPeriod(d = new Date()): Period {
  const from = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0)
  return { from, to }
}

/**
 * Cijfers van één of alle setters over een periode.
 *
 * De uren komen uit de tijdregistratie, de commissie uit de afspraken die als
 * gewonnen zijn afgesloten. Die commissie wordt NIET hier berekend maar
 * overgenomen zoals ze bij het afsluiten is vastgelegd — anders zou een latere
 * wijziging van het percentage met terugwerkende kracht doorwerken in wat
 * iemand al had verdiend.
 */
export async function statsFor(period: Period, setterId?: string): Promise<SetterStats[]> {
  const admin = createAdminSupabaseClient()
  const setters = await listSetters()
  const wanted = setterId ? setters.filter((s) => s.id === setterId) : setters
  if (wanted.length === 0) return []

  const ids = wanted.map((s) => s.id)
  const fromIso = period.from.toISOString()
  const toIso = period.to.toISOString()

  const [{ data: times }, { data: appts }] = await Promise.all([
    // Ook blokken die vóór de periode begonnen maar er nog in doorlopen.
    admin.from('sales_time_entries')
      .select('setter_id, started_at, ended_at')
      .in('setter_id', ids)
      .lt('started_at', toIso)
      .or(`ended_at.is.null,ended_at.gte.${fromIso}`),
    admin.from('sales_appointments')
      .select('setter_profile_id, status, outcome, deal_value_cents, commission_cents, starts_at')
      .in('setter_profile_id', ids)
      .gte('starts_at', fromIso)
      .lt('starts_at', toIso),
  ])

  const timeBySetter = new Map<string, Interval[]>()
  for (const t of (times ?? []) as { setter_id: string; started_at: string; ended_at: string | null }[]) {
    const list = timeBySetter.get(t.setter_id) ?? []
    // Buiten de periode geknipt, zodat een blok dat over middernacht van de
    // maand loopt niet volledig in één maand terechtkomt.
    const start = new Date(t.started_at) < period.from ? fromIso : t.started_at
    const end = t.ended_at && new Date(t.ended_at) > period.to ? toIso : t.ended_at
    list.push({ started_at: start, ended_at: end })
    timeBySetter.set(t.setter_id, list)
  }

  const now = Date.now()
  return wanted.map((setter) => {
    const entries = timeBySetter.get(setter.id) ?? []
    const seconds = totalSeconds(entries, now)
    const running = entries.find((e) => e.ended_at === null)

    const mine = ((appts ?? []) as {
      setter_profile_id: string; status: string; outcome: string | null
      deal_value_cents: number | null; commission_cents: number | null
    }[]).filter((a) => a.setter_profile_id === setter.id && a.status !== 'cancelled')

    const won = mine.filter((a) => a.outcome === 'won')
    const lost = mine.filter((a) => a.outcome === 'lost')
    const commission = won.reduce((sum, a) => sum + (a.commission_cents ?? 0), 0)
    const hours = earnedCents(seconds, setter.hourly_rate_cents)

    return {
      setter,
      seconds,
      earnedCents: hours,
      runningSince: running?.started_at ?? null,
      appointments: mine.length,
      won: won.length,
      lost: lost.length,
      open: mine.length - won.length - lost.length,
      dealValueCents: won.reduce((sum, a) => sum + (a.deal_value_cents ?? 0), 0),
      commissionCents: commission,
      totalCents: hours + commission,
    }
  })
}

export type Payout = {
  setterId: string
  setterName: string
  month: string
  kind: 'hours' | 'commission'
  amountCents: number
  status: 'open' | 'paid'
  paidAt: string | null
}

/**
 * De twee afrekeningen per setter voor een maand: uren en commissie.
 *
 * Het bedrag wordt telkens opnieuw uit de bron berekend zolang er niet betaald
 * is. Zodra er "betaald" op staat, blijft het bedrag staan zoals het toen was —
 * anders zou een late tijdregistratie een al betaalde afrekening veranderen.
 */
export async function payoutsFor(month: Date): Promise<Payout[]> {
  const admin = createAdminSupabaseClient()
  const period = monthPeriod(month)
  const key = monthKey(period.from)
  const stats = await statsFor(period)

  const { data: saved } = await admin.from('sales_payouts')
    .select('setter_id, kind, amount_cents, status, paid_at').eq('month', key)
  const savedByKey = new Map(
    ((saved ?? []) as { setter_id: string; kind: string; amount_cents: number; status: string; paid_at: string | null }[])
      .map((r) => [`${r.setter_id}|${r.kind}`, r]),
  )

  const out: Payout[] = []
  for (const s of stats) {
    for (const kind of ['hours', 'commission'] as const) {
      const live = kind === 'hours' ? s.earnedCents : s.commissionCents
      const row = savedByKey.get(`${s.setter.id}|${kind}`)
      const paid = row?.status === 'paid'
      out.push({
        setterId: s.setter.id,
        setterName: s.setter.name,
        month: key,
        kind,
        amountCents: paid ? row!.amount_cents : live,
        status: paid ? 'paid' : 'open',
        paidAt: row?.paid_at ?? null,
      })
    }
  }
  return out
}
