import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff, requireAdmin } from '@/lib/supabase/server'
import { workspaceVoor, workspacesVoor, type Workspace } from '@/lib/aanbestedingen/workspaces'
import { scoreWorkspace } from '@/lib/aanbestedingen/score'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * Voorselectie: alle nieuwe opdrachten van een workspace een score geven.
 *
 * Dit is de goedkope stap — een licht model dat enkel titel, omschrijving en
 * CPV-code ziet. De volledige analyse met bestekken komt daarna, en enkel voor
 * de top van deze lijst.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const isAdmin = !!(await requireAdmin())

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY ontbreekt in de omgeving. Zonder die sleutel kunnen we niet scoren.',
      }, { status: 503 })
    }

    const b = await req.json().catch(() => ({}))

    let ws: Workspace | null = null
    try {
      ws = b.filterId
        ? await workspaceVoor(String(b.filterId), actor.id, isAdmin)
        : (await workspacesVoor(actor.id, isAdmin))[0] ?? null
    } catch (e) {
      if (/does not exist|schema cache/i.test(e instanceof Error ? e.message : '')) {
        return NextResponse.json({
          error: 'De tabellen voor Aanbestedingen bestaan nog niet. Draai eerst de migratie.',
        }, { status: 503 })
      }
      throw e
    }
    if (!ws) return NextResponse.json({ error: 'Geen workspace gevonden.' }, { status: 404 })

    const admin = createAdminSupabaseClient()
    const { data: runRow } = await admin.from('aanbesteding_runs').insert({
      filter_id: ws.id,
      status: 'bezig',
      fase: 'scoren',
      omschrijving: 'Opdrachten beoordelen…',
      aangevraagd_door: actor.email ?? '',
      gestart_op: new Date().toISOString(),
    }).select('id').single()
    const runId = (runRow as { id: string } | null)?.id ?? null

    const bijwerken = async (velden: Record<string, unknown>) => {
      if (runId) await admin.from('aanbesteding_runs').update(velden).eq('id', runId)
    }

    try {
      const res = await scoreWorkspace(ws.id, {
        onVoortgang: async (nu, totaal) => {
          await bijwerken({
            stap_nu: nu, stap_totaal: totaal,
            omschrijving: `${nu} van ${totaal} beoordeeld…`,
          })
        },
      })

      const resultaat = [
        `${res.bekeken} opdracht(en) bekeken`,
        `${res.gescoord} beoordeeld`,
        res.overgeslagen > 0 ? `${res.overgeslagen} ongewijzigd of niet meer relevant` : null,
        res.zonder_antwoord > 0 ? `LET OP: ${res.zonder_antwoord} zonder antwoord` : null,
        `$${res.kost_usd.toFixed(3)}`,
      ].filter(Boolean).join(' · ')

      await bijwerken({
        status: 'klaar', fase: '', resultaat,
        omschrijving: '', klaar_op: new Date().toISOString(),
      })

      const meta = requestMeta(req)
      await logAudit({
        action: 'aanbestedingen.scoren', entityType: 'aanbestedingen_filter', entityId: ws.id,
        summary: `Aanbestedingen ${ws.naam}: ${resultaat}`,
        actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: isAdmin ? 'admin' : 'employee',
        ip: meta.ip, userAgent: meta.userAgent,
      })

      return NextResponse.json({ ok: true, runId, ...res, resultaat })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Beoordelen mislukt'
      await bijwerken({
        status: 'mislukt', fase: '', resultaat: msg, klaar_op: new Date().toISOString(),
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
