import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff, requireAdmin } from '@/lib/supabase/server'
import { workspaceVoor, workspacesVoor, type Workspace } from '@/lib/aanbestedingen/workspaces'
import { analyseerWorkspace } from '@/lib/aanbestedingen/analyse'
import { bdaConfigured } from '@/lib/aanbestedingen/bda'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * De top van de voorselectie volledig uitwerken, mét de bestekken.
 *
 * Dit is de dure stap. Wat er doorgaat wordt begrensd door twee instellingen
 * van de workspace: `mail_drempel` (wat is interessant) en `ai_top_x` (hoeveel
 * per run). De kost van de run staat in het resultaat, zodat je ziet wat het
 * gekost heeft en niet pas op de factuur.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const isAdmin = !!(await requireAdmin())

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({
        error: 'ANTHROPIC_API_KEY ontbreekt in de omgeving. Zonder die sleutel kunnen we niet analyseren.',
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
      fase: 'analyseren',
      omschrijving: 'Dossiers uitwerken…',
      aangevraagd_door: actor.email ?? '',
      gestart_op: new Date().toISOString(),
    }).select('id').single()
    const runId = (runRow as { id: string } | null)?.id ?? null

    const bijwerken = async (velden: Record<string, unknown>) => {
      if (runId) await admin.from('aanbesteding_runs').update(velden).eq('id', runId)
    }

    try {
      const res = await analyseerWorkspace(ws, {
        onVoortgang: async (nu, totaal, wat) => {
          await bijwerken({
            stap_nu: nu, stap_totaal: totaal,
            omschrijving: wat ? `${nu + 1} van ${totaal}: ${wat.slice(0, 120)}` : '',
          })
        },
      })

      const resultaat = res.aangeboden === 0
        // Nul is hier een normale uitkomst, geen storing — maar zeg wél waarom,
        // anders lijkt het alsof er iets stuk is.
        ? `Niets te doen: geen opdracht haalde score ${ws.mail_drempel} of hoger.`
        : [
          `${res.aangeboden} in aanmerking`,
          `${res.geanalyseerd} uitgewerkt`,
          res.overgeslagen > 0 ? `${res.overgeslagen} ongewijzigd` : null,
          res.zonder_bestek > 0 ? `${res.zonder_bestek} zonder bestek` : null,
          res.mislukt > 0 ? `LET OP: ${res.mislukt} mislukt` : null,
          `$${res.kost_usd.toFixed(2)}`,
        ].filter(Boolean).join(' · ')

      await bijwerken({
        status: 'klaar', fase: '', resultaat,
        omschrijving: '', klaar_op: new Date().toISOString(),
      })

      const meta = requestMeta(req)
      await logAudit({
        action: 'aanbestedingen.analyseren', entityType: 'aanbestedingen_filter', entityId: ws.id,
        summary: `Aanbestedingen ${ws.naam}: ${resultaat}`,
        actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: isAdmin ? 'admin' : 'employee',
        ip: meta.ip, userAgent: meta.userAgent,
      })

      return NextResponse.json({
        ok: true, runId, ...res, resultaat,
        // Zonder BDA-sleutel lukt het analyseren wel, maar zonder bestekken.
        // Dat is een half dossier, dus dat zeggen we erbij.
        waarschuwing: !bdaConfigured()
          ? 'BDA_AUTH_CLIENT_SECRET ontbreekt: de dossiers zijn gemaakt zonder de bestekdocumenten.'
          : undefined,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Analyseren mislukt'
      await bijwerken({
        status: 'mislukt', fase: '', resultaat: msg, klaar_op: new Date().toISOString(),
      })
      return NextResponse.json({ error: msg }, { status: 502 })
    }
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
