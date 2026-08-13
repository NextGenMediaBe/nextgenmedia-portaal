import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { loadCalendar, logLeadEvent, getSalesClient } from '@/lib/sales/service'
import { isBookable } from '@/lib/sales/availability'
import { APPOINTMENT_STAGE } from '@/lib/sales/stages'
import { createEvent, moveEvent, deleteEvent } from '@/lib/sales/google-calendar'
import { normalizePhone } from '@/lib/sales/dedupe'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Hervalidatie: valt dit tijdvak écht binnen een boekbaar (wit) segment? */
async function assertBookable(salesClientId: string, start: number, end: number, ignoreApptId?: string): Promise<void> {
  const pad = 86400000
  const data = await loadCalendar(salesClientId, start - pad, end + pad)
  if (!data) throw new Error('Klant niet gevonden')

  // Bij verplaatsen telt de afspraak zelf niet als blokkade: die gaat immers weg
  // van zijn oude plek. We voegen zijn eigen tijd daarom terug toe aan het wit.
  let segments = data.segments
  if (ignoreApptId) {
    const self = data.appointments.find((a) => a.id === ignoreApptId)
    if (self) {
      const s = new Date(self.starts_at).getTime(), e = new Date(self.ends_at).getTime()
      segments = [...segments, { start: s, end: e }]
        .sort((a, b) => a.start - b.start)
        .reduce<{ start: number; end: number }[]>((acc, cur) => {
          const last = acc[acc.length - 1]
          if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
          else acc.push({ ...cur })
          return acc
        }, [])
    }
  }

  if (!isBookable(segments, start, end)) {
    throw new Error('Dit moment is niet (meer) vrij. Ververs de agenda en kies een wit vak.')
  }

  // Max. aantal afspraken per dag (§8).
  const client = data.client
  if (client.max_per_day > 0) {
    const dayStart = new Date(start); dayStart.setUTCHours(0, 0, 0, 0)
    const sameDay = data.appointments.filter((a) => {
      if (a.id === ignoreApptId) return false
      const t = new Date(a.starts_at).getTime()
      return t >= dayStart.getTime() && t < dayStart.getTime() + 86400000
    })
    if (sameDay.length >= client.max_per_day) {
      throw new Error(`Deze klant staat maximaal ${client.max_per_day} afspraken per dag toe.`)
    }
  }
}

// POST — boeken (§5). Transactioneel van opzet: mislukt Google, dan rollen we
// de afspraak terug zodat er nooit een afspraak zonder agenda-item bestaat.
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()

    const salesClientId = String(b.salesClientId ?? '')
    const start = Number(b.startsAt), end = Number(b.endsAt)
    if (!salesClientId || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json({ error: 'Ongeldig tijdvak' }, { status: 400 })
    }

    const client = await getSalesClient(salesClientId)
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    // 1) Hervalideren tegen dezelfde berekening als de kalender tekent.
    await assertBookable(salesClientId, start, end)

    const admin = createAdminSupabaseClient()
    const leadId = b.leadId ? String(b.leadId) : null

    // Contact + e-mail bepalen. Een handmatig ingevuld adres overschrijft het
    // adres van de lead in de CRM (§5).
    let contactId: string | null = null
    let attendee: string | null = String(b.attendeeEmail ?? '').trim() || null
    let leadStage: string | null = null
    if (leadId) {
      const { data: lead } = await admin
        .from('sales_leads')
        .select('id, contact_id, stage_key, sales_contacts ( id, email )')
        .eq('id', leadId).eq('sales_client_id', salesClientId).maybeSingle()
      if (!lead) return NextResponse.json({ error: 'Lead hoort niet bij deze klant' }, { status: 400 })
      contactId = (lead as { contact_id: string | null }).contact_id
      leadStage = (lead as { stage_key: string }).stage_key
      const leadEmail = (lead as { sales_contacts?: { email?: string | null } | null }).sales_contacts?.email ?? null
      if (!attendee) attendee = leadEmail
      else if (contactId && attendee !== leadEmail) {
        await admin.from('sales_contacts').update({ email: attendee }).eq('id', contactId)
      }
    }

    // 2) Afspraak vastleggen. De exclusion-constraint in de database is de
    //    laatste rem tegen dubbel boeken bij gelijktijdige verzoeken.
    const { data: appt, error: apptErr } = await admin.from('sales_appointments').insert({
      sales_client_id: salesClientId,
      lead_id: leadId,
      contact_id: contactId,
      setter_id: actor.id,
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
      status: 'scheduled',
      notes: String(b.notes ?? '') || null,
      client_note: String(b.clientNote ?? '') || null,
      attendee_email: attendee,
    }).select('id').single()
    if (apptErr || !appt) {
      const dup = /exclusion|overlap|sales_appt_no_overlap/i.test(apptErr?.message ?? '')
      return NextResponse.json({ error: dup ? 'Er staat al een afspraak op dit moment.' : 'Afspraak opslaan mislukt' }, { status: 409 })
    }

    // 3) Google-event aanmaken. Mislukt dit → afspraak terugdraaien.
    let meetUrl: string | null = null
    try {
      const { data: nameRow } = leadId
        ? await admin.from('sales_leads').select('sales_companies ( name )').eq('id', leadId).maybeSingle()
        : { data: null }
      const company = (nameRow as { sales_companies?: { name?: string } } | null)?.sales_companies?.name ?? 'Prospect'
      const ev = await createEvent(salesClientId, {
        summary: `Afspraak — ${company}`,
        description: [b.notes, b.clientNote].filter(Boolean).join('\n\n'),
        startsAt: start, endsAt: end, timezone: client.timezone,
        attendeeEmail: attendee, withMeet: b.withMeet !== false,
      })
      meetUrl = ev.meetUrl
      await admin.from('sales_appointments')
        .update({ external_event_id: ev.eventId, meet_url: ev.meetUrl }).eq('id', appt.id)
    } catch (e) {
      await admin.from('sales_appointments').delete().eq('id', appt.id)
      return NextResponse.json({ error: `De afspraak is niet geboekt: ${e instanceof Error ? e.message : 'agenda-fout'}` }, { status: 502 })
    }

    // 4) DE KOPPELING (§6): een geslaagde boeking — en alleen dat — zet de lead
    //    op "Afspraak ingepland".
    if (leadId) {
      await admin.from('sales_leads').update({ stage_key: APPOINTMENT_STAGE }).eq('id', leadId)
      await logLeadEvent(leadId, {
        kind: 'stage', fromStage: leadStage, toStage: APPOINTMENT_STAGE,
        body: `Afspraak geboekt op ${new Date(start).toISOString()}`,
        actorId: actor.id, actorEmail: actor.email ?? null,
      })
    }

    const meta = requestMeta(req)
    await logAudit({
      action: 'sales.appointment.book', entityType: 'sales_appointment', entityId: appt.id as string,
      summary: `Verkoop: afspraak geboekt voor ${client.name}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({ ok: true, id: appt.id, meetUrl })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

// PATCH — verplaatsen naar een ander wit moment (§5).
export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const id = String(b.id ?? '')
    const start = Number(b.startsAt), end = Number(b.endsAt)
    if (!id || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json({ error: 'Ongeldig tijdvak' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { data: appt } = await admin.from('sales_appointments')
      .select('id, sales_client_id, external_event_id, status').eq('id', id).maybeSingle()
    if (!appt) return NextResponse.json({ error: 'Afspraak niet gevonden' }, { status: 404 })
    if (appt.status === 'cancelled') return NextResponse.json({ error: 'Deze afspraak is geannuleerd' }, { status: 400 })

    const client = await getSalesClient(appt.sales_client_id as string)
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })

    await assertBookable(appt.sales_client_id as string, start, end, id)

    const { error } = await admin.from('sales_appointments')
      .update({ starts_at: new Date(start).toISOString(), ends_at: new Date(end).toISOString() }).eq('id', id)
    if (error) {
      const dup = /exclusion|overlap/i.test(error.message)
      return NextResponse.json({ error: dup ? 'Er staat al een afspraak op dit moment.' : 'Verplaatsen mislukt' }, { status: 409 })
    }

    if (appt.external_event_id) {
      try {
        await moveEvent(appt.sales_client_id as string, appt.external_event_id as string, start, end, client.timezone)
      } catch (e) {
        return NextResponse.json({ error: `Verplaatst in de app, maar de agenda gaf een fout: ${e instanceof Error ? e.message : 'onbekend'}` }, { status: 502 })
      }
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

// DELETE ?id= — annuleren. Verwijdert het agenda-item en haalt de afspraak uit
// alle tellingen (§5: geannuleerde afspraken tellen NERGENS mee).
export async function DELETE(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const id = req.nextUrl.searchParams.get('id') ?? ''
    if (!id) return NextResponse.json({ error: 'id vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: appt } = await admin.from('sales_appointments')
      .select('id, sales_client_id, external_event_id').eq('id', id).maybeSingle()
    if (!appt) return NextResponse.json({ error: 'Afspraak niet gevonden' }, { status: 404 })

    await admin.from('sales_appointments').update({ status: 'cancelled' }).eq('id', id)
    if (appt.external_event_id) {
      await deleteEvent(appt.sales_client_id as string, appt.external_event_id as string)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
