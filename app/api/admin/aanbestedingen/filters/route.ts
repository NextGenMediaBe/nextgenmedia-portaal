import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff, requireAdmin } from '@/lib/supabase/server'
import { parseShortLink, isValidShortLink } from '@/lib/aanbestedingen/short-link'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'

/**
 * De zoekfilters van publicprocurement.be.
 *
 * Elke medewerker met de rol kan er een eigen hebben: de advertiser volgt
 * andere CPV-codes dan het marketingteam. Een beheerder ziet ze allemaal, een
 * medewerker enkel de zijne — en dat wordt hier afgedwongen, niet in het scherm.
 */

type Filter = {
  id: string
  naam: string
  short_link: string
  include_closed: boolean
  eigenaar: string
  ai_top_x: number
  mail_drempel: number
  auto_enabled: boolean
  auto_dagen: number[]
  auto_uur: number
}

async function scope() {
  const actor = await requireStaff()
  if (!actor) return null
  return { actor, isAdmin: !!(await requireAdmin()) }
}

// GET — alle filters (admin) of enkel de eigen (medewerker).
export async function GET() {
  try {
    const s = await scope()
    if (!s) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    let q = admin.from('aanbestedingen_filters').select('*').order('naam')
    if (!s.isAdmin) q = q.eq('eigenaar', s.actor.id)

    const { data, error } = await q
    if (error) {
      if (/aanbestedingen_filters|does not exist|schema cache/i.test(error.message)) {
        return NextResponse.json({
          filters: [], isAdmin: s.isAdmin,
          hint: 'De tabellen voor Aanbestedingen bestaan nog niet. Draai supabase/migrations/99999999_SYNC_ALL.sql.',
        })
      }
      throw new Error(error.message)
    }
    return NextResponse.json({ filters: (data ?? []) as Filter[], isAdmin: s.isAdmin })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

/**
 * PUT — de filter van één medewerker vastleggen vanuit zijn werknemersfiche.
 * Body: { eigenaar, naam, link, includeClosed?, aiTopX?, mailDrempel?, auto* }
 *
 * Alleen een beheerder mag dit: een filter bepaalt welke opdrachten iemand te
 * zien krijgt, en de kennisbank die eraan hangt bevat onze tarieven.
 */
export async function PUT(req: NextRequest) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Enkel een admin kan dit instellen' }, { status: 403 })
    const b = await req.json()

    const eigenaar = String(b.eigenaar ?? '')
    if (!eigenaar) return NextResponse.json({ error: 'Geen medewerker opgegeven' }, { status: 400 })

    const admin = createAdminSupabaseClient()

    // Leeg gemaakt? Dan de filter verwijderen — met alles wat eraan hangt.
    const raw = String(b.link ?? '').trim()
    if (!raw) {
      const { data: bestaand } = await admin.from('aanbestedingen_filters')
        .select('id').eq('eigenaar', eigenaar).maybeSingle()
      if (bestaand) {
        await admin.from('aanbestedingen_filters').delete().eq('id', (bestaand as { id: string }).id)
        const meta = requestMeta(req)
        await logAudit({
          action: 'aanbestedingen.filter.delete', entityType: 'aanbestedingen_filter',
          entityId: (bestaand as { id: string }).id,
          summary: 'Aanbestedingen: filter van een medewerker verwijderd',
          actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
          ip: meta.ip, userAgent: meta.userAgent,
        })
      }
      return NextResponse.json({ ok: true, filter: null })
    }

    const code = parseShortLink(raw)
    if (!code || !isValidShortLink(code)) {
      return NextResponse.json({
        error: 'Dat lijkt geen geldige filterlink. Plak de deel-link van publicprocurement.be — die bevat "shortLink=".',
      }, { status: 400 })
    }

    const payload = {
      naam: String(b.naam ?? '').trim() || 'Aanbestedingen',
      short_link: code,
      include_closed: b.includeClosed === true,
      eigenaar,
      ai_top_x: Math.min(50, Math.max(1, Number(b.aiTopX) || 25)),
      mail_drempel: Math.min(100, Math.max(0, Number(b.mailDrempel) || 70)),
      auto_enabled: b.autoEnabled === true,
      auto_dagen: Array.isArray(b.autoDagen) && b.autoDagen.length
        ? b.autoDagen.map((d: unknown) => Number(d)).filter((d: number) => d >= 1 && d <= 7)
        : [1, 2, 3, 4, 5, 6, 7],
      auto_uur: Math.min(23, Math.max(0, Number(b.autoUur) ?? 5)),
    }

    // Eén filter per medewerker: bestaat er al een, dan bijwerken.
    const { data: bestaand } = await admin.from('aanbestedingen_filters')
      .select('id').eq('eigenaar', eigenaar).maybeSingle()

    let filterId: string
    if (bestaand) {
      filterId = (bestaand as { id: string }).id
      const { error } = await admin.from('aanbestedingen_filters').update(payload).eq('id', filterId)
      if (error) throw new Error(error.message)
    } else {
      const { data, error } = await admin.from('aanbestedingen_filters')
        .insert(payload).select('id').single()
      if (error) {
        if (/aanbestedingen_filters|does not exist|schema cache/i.test(error.message)) {
          return NextResponse.json({
            error: 'De tabellen voor Aanbestedingen bestaan nog niet. Draai eerst de migratie.',
          }, { status: 503 })
        }
        throw new Error(error.message)
      }
      filterId = (data as { id: string }).id
      // Lege kennisbank meteen aanmaken, zodat het scherm niet leeg blijft.
      await admin.from('aanbesteding_kennis').upsert({ filter_id: filterId }, { onConflict: 'filter_id' })
    }

    const meta = requestMeta(req)
    await logAudit({
      action: 'aanbestedingen.filter.save', entityType: 'aanbestedingen_filter', entityId: filterId,
      summary: `Aanbestedingen: filter ${payload.naam} ingesteld`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, filter: { id: filterId, ...payload } })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
