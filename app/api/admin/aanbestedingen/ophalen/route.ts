import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff, requireAdmin } from '@/lib/supabase/server'
import { BdaClient, bdaConfigured } from '@/lib/aanbestedingen/bda'
import { bewaarOpdrachten } from '@/lib/aanbestedingen/store'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Opdrachten ophalen bij de BDA en wegschrijven.
 *
 * Dit is enkel het OPHALEN — scoren en analyseren volgt in de volgende stap.
 * Ophalen kost niets (geen AI), dus we halen altijd het volledige filter op.
 *
 * Een medewerker mag enkel zijn eigen filter verversen; dat wordt hier
 * gecontroleerd en niet in het scherm.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const isAdmin = !!(await requireAdmin())

    if (!bdaConfigured()) {
      return NextResponse.json({
        error: 'BDA_AUTH_CLIENT_SECRET ontbreekt in de omgeving. Zonder die sleutel kunnen we niets ophalen.',
      }, { status: 503 })
    }

    const b = await req.json().catch(() => ({}))
    const admin = createAdminSupabaseClient()

    // Welke filter? Een medewerker: de zijne. Een admin mag kiezen.
    let q = admin.from('aanbestedingen_filters').select('*')
    q = b.filterId ? q.eq('id', String(b.filterId)) : q
    if (!isAdmin) q = q.eq('eigenaar', actor.id)
    const { data: filterRow, error: filterErr } = await q.limit(1).maybeSingle()

    if (filterErr && /aanbestedingen_filters|does not exist|schema cache/i.test(filterErr.message)) {
      return NextResponse.json({
        error: 'De tabellen voor Aanbestedingen bestaan nog niet. Draai eerst de migratie.',
      }, { status: 503 })
    }
    if (!filterRow) {
      return NextResponse.json({
        error: 'Geen filter gevonden. Stel eerst een filterlink in bij Werknemers.',
      }, { status: 404 })
    }

    const filter = filterRow as {
      id: string; naam: string; short_link: string; include_closed: boolean
    }

    // Run vastleggen zodat de voortgangsbalk (volgende stap) iets heeft om te lezen.
    const { data: runRow } = await admin.from('aanbesteding_runs').insert({
      filter_id: filter.id,
      status: 'bezig',
      fase: 'ophalen',
      omschrijving: 'Opdrachten ophalen bij publicprocurement.be…',
      aangevraagd_door: actor.email ?? '',
      gestart_op: new Date().toISOString(),
    }).select('id').single()
    const runId = (runRow as { id: string } | null)?.id ?? null

    const bijwerken = async (velden: Record<string, unknown>) => {
      if (runId) await admin.from('aanbesteding_runs').update(velden).eq('id', runId)
    }

    try {
      const client = new BdaClient()
      const { records, totaal } = await client.alleOpdrachten(filter.short_link, {
        includeClosed: filter.include_closed,
        onPage: async (opgehaald, tot) => {
          await bijwerken({
            stap_nu: opgehaald, stap_totaal: tot,
            omschrijving: `${opgehaald} van ${tot} opdrachten opgehaald…`,
          })
        },
      })

      const res = await bewaarOpdrachten(filter.id, records)

      // Vertel de HELE keten, niet enkel een getal. "0 dossiers" zonder uitleg
      // levert alleen maar vragen op.
      const resultaat = [
        `${res.totaal} opdracht(en) in je filter`,
        `${res.nieuw} nieuw`,
        `${res.bijgewerkt} bestaand`,
        res.verdwenen > 0 ? `${res.verdwenen} niet meer gevonden` : null,
        records.length < totaal ? `LET OP: ${records.length} van ${totaal} opgehaald` : null,
      ].filter(Boolean).join(' · ')

      await bijwerken({
        status: 'klaar', fase: '', resultaat,
        omschrijving: '', klaar_op: new Date().toISOString(),
      })

      const meta = requestMeta(req)
      await logAudit({
        action: 'aanbestedingen.ophalen', entityType: 'aanbestedingen_filter', entityId: filter.id,
        summary: `Aanbestedingen: ${resultaat}`,
        actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: isAdmin ? 'admin' : 'employee',
        ip: meta.ip, userAgent: meta.userAgent,
      })

      return NextResponse.json({ ok: true, runId, totalCount: totaal, ...res, resultaat })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Ophalen mislukt'
      // Een mislukte run zichtbaar laten falen; stil "niets gevonden" tonen is
      // hoe je maandenlang niet merkt dat er iets stuk is.
      await bijwerken({
        status: 'mislukt', fase: '', resultaat: msg, klaar_op: new Date().toISOString(),
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
