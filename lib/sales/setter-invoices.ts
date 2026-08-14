import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { listSetters, monthPeriod, statsFor } from '@/lib/sales/setters'
import { hoursText } from '@/lib/sales/earnings'

/**
 * De twee facturen die een appointment setter ons per maand stuurt: gewerkte
 * uren en commissie.
 *
 * Ze staan in dezelfde facturentabel, zodat je ze op het facturenscherm ziet,
 * maar met `kind` op setter_hours of setter_commission. Die markering is niet
 * cosmetisch: de omzet in Financiën komt uit deze tabel, en zonder dat
 * onderscheid zou de kost van een setter als ONZE omzet meetellen.
 *
 * Bedragen zijn EXCL. btw — € 50/u is een tarief zonder btw. Het btw-percentage
 * blijft op de standaard staan; wat een zelfstandige effectief aanrekent, hangt
 * van zijn statuut af en dat vult wie de factuur ontvangt zelf aan.
 *
 * BIJWERKEN, NIET OVERSCHRIJVEN: zodra een factuur op iets anders dan
 * "te factureren" staat, blijven bedrag en omschrijving met rust. Anders zou
 * een late tijdregistratie een al verstuurde factuur stilletjes veranderen.
 */

export type SyncResult = { created: number; updated: number; skipped: number }

/** Maandsleutel zoals de facturentabel hem gebruikt: 'YYYY-MM'. */
export function invoiceMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const KINDS = {
  hours: 'setter_hours',
  commission: 'setter_commission',
} as const

/**
 * Zorgt dat de facturen van één maand kloppen met wat er gewerkt en gewonnen is.
 * Idempotent: kan zo vaak draaien als je wil.
 *
 * Er wordt pas een factuur aangemaakt zodra er ECHT iets te factureren valt —
 * meer dan nul, dus vanaf de eerste seconde die tot een cent leidt. Een factuur
 * van € 0,00 helpt niemand.
 */
export async function syncSetterInvoices(month: Date): Promise<SyncResult> {
  const admin = createAdminSupabaseClient()
  const out: SyncResult = { created: 0, updated: 0, skipped: 0 }

  const period = monthPeriod(month)
  const key = invoiceMonth(period.from)
  const setters = await listSetters()
  if (setters.length === 0) return out

  const stats = await statsFor(period)

  const { data: existingRows, error: readErr } = await admin.from('invoices')
    .select('id, setter_id, kind, amount_excl, status, source')
    .eq('invoice_month', key)
    .not('setter_id', 'is', null)
  // Kolommen bestaan nog niet → niets doen in plaats van stukgaan.
  if (readErr) return out

  const existing = new Map(
    ((existingRows ?? []) as { id: string; setter_id: string; kind: string; status: string }[])
      .map((r) => [`${r.setter_id}|${r.kind}`, r]),
  )

  // De laatste dag van de maand: een afrekening loopt tot het einde van de maand.
  const invoiceDate = new Date(period.to.getTime() - 86400000).toISOString().slice(0, 10)

  for (const s of stats) {
    const lines: { kind: string; cents: number; description: string }[] = [
      {
        kind: KINDS.hours,
        cents: s.earnedCents,
        description: `Appointment setting — ${hoursText(s.seconds)} gebeld (${(s.setter.hourly_rate_cents / 100).toFixed(2)}/u)`,
      },
      {
        kind: KINDS.commission,
        cents: s.commissionCents,
        description: `Commissie — ${s.won} contract(en) à ${Number(s.setter.commission_pct)}%`,
      },
    ]

    for (const line of lines) {
      const row = existing.get(`${s.setter.id}|${line.kind}`)
      const amount = Number((line.cents / 100).toFixed(2))

      if (!row) {
        if (line.cents <= 0) { out.skipped++; continue }   // niets te factureren
        const { error } = await admin.from('invoices').insert({
          invoice_month: key,
          invoice_date: invoiceDate,
          description: `${s.setter.name} · ${line.description}`,
          amount_excl: amount,
          amount_incl: amount,       // btw laten we op de ontvangen factuur zelf
          vat_pct: 0,
          status: 'te_factureren',
          kind: line.kind,
          setter_id: s.setter.id,
          source: 'auto',
        })
        if (!error) out.created++
        continue
      }

      // Al verstuurd of betaald? Dan blijft het bedrag zoals het was.
      if (row.status !== 'te_factureren') { out.skipped++; continue }

      const { error } = await admin.from('invoices').update({
        amount_excl: amount,
        amount_incl: amount,
        description: `${s.setter.name} · ${line.description}`,
        invoice_date: invoiceDate,
      }).eq('id', row.id)
      if (!error) out.updated++
    }
  }

  return out
}

/**
 * De maand van vandaag bijwerken, plus de vorige.
 *
 * Die vorige maand is er bewust bij: commissie valt in de maand waarin het
 * contract getekend is, en dat kan gaan over een afspraak van vorige maand die
 * je nu pas afsluit.
 */
export async function syncRecentSetterInvoices(now = new Date()): Promise<void> {
  try {
    await syncSetterInvoices(now)
    await syncSetterInvoices(new Date(now.getFullYear(), now.getMonth() - 1, 1))
  } catch {
    // Facturen bijwerken mag nooit een scherm of een boeking laten falen.
  }
}
