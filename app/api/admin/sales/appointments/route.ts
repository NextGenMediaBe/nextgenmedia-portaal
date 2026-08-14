import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { loadCalendar, logLeadEvent, getOrCreateSalesOrg, moveLeadToPipeline } from '@/lib/sales/service'
import { isBookable } from '@/lib/sales/availability'
import { APPOINTMENT_STAGE } from '@/lib/sales/stages'
import { createEvent, moveEvent, deleteEvent } from '@/lib/sales/google-calendar'
import { normalizePhone } from '@/lib/sales/dedupe'
import { listPipelines, defaultPipelineId } from '@/lib/sales/pipelines'
import { scheduleReminderFor, cancelReminderFor } from '@/lib/sales/reminders'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Hervalidatie: valt dit tijdvak écht binnen een boekbaar (wit) segment? */
async function assertBookable(
  salesClientId: string, start: number, end: number, ownerId: string | null, ignoreApptId?: string,
): Promise<void> {
  const pad = 86400000
  const data = await loadCalendar(salesClientId, start - pad, end + pad, ownerId)
  if (!data) throw new Error('Pipeline niet gevonden')

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
      throw new Error(`Er staan maximaal ${client.max_per_day} afspraken per dag ingesteld.`)
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

    const start = Number(b.startsAt), end = Number(b.endsAt)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      return NextResponse.json({ error: 'Ongeldig tijdvak' }, { status: 400 })
    }

    // Eén pipeline: het id komt van de server, nooit uit het verzoek.
    const client = await getOrCreateSalesOrg()
    const salesClientId = client.id

    // Welke agenda (persoon)? Zonder keuze pakt loadCalendar de eerste.
    const requestedOwner = b.ownerId ? String(b.ownerId) : null
    const cal = await loadCalendar(salesClientId, start - 864e5, end + 864e5, requestedOwner)
    const ownerId = cal?.ownerId ?? null
    if (!ownerId) return NextResponse.json({ error: 'Koppel eerst een agenda (Bram of Marco) via Appointment setting.' }, { status: 400 })

    // 1) Hervalideren tegen dezelfde berekening als de kalender tekent.
    await assertBookable(salesClientId, start, end, ownerId)

    const admin = createAdminSupabaseClient()
    const leadId = b.leadId ? String(b.leadId) : null

    // Contact + e-mail bepalen. Een handmatig ingevuld adres overschrijft het
    // adres van de lead in de CRM (§5).
    let contactId: string | null = null
    let attendee: string | null = String(b.attendeeEmail ?? '').trim() || null
    let leadStage: string | null = null
    // Voor welk merk is deze afspraak? Standaard het merk van de lead, maar de
    // setter mag dat overrulen: aan de telefoon blijkt soms dat een prospect uit
    // de ene pipeline beter bij het andere merk past. De keuze wordt hieronder
    // wel gecontroleerd tegen onze eigen pipelines.
    let pipelineId: string | null = null
    let leadPipelineId: string | null = null
    if (leadId) {
      const { data: lead } = await admin
        .from('sales_leads')
        .select('id, contact_id, stage_key, pipeline_id, sales_contacts ( id, email )')
        .eq('id', leadId).eq('sales_client_id', salesClientId).maybeSingle()
      if (!lead) return NextResponse.json({ error: 'Deze lead staat niet in de pipeline' }, { status: 400 })
      contactId = (lead as { contact_id: string | null }).contact_id
      leadStage = (lead as { stage_key: string }).stage_key
      leadPipelineId = (lead as { pipeline_id: string | null }).pipeline_id
      pipelineId = leadPipelineId
      const leadEmail = (lead as { sales_contacts?: { email?: string | null } | null }).sales_contacts?.email ?? null
      if (!attendee) attendee = leadEmail
      else if (contactId && attendee !== leadEmail) {
        await admin.from('sales_contacts').update({ email: attendee }).eq('id', contactId)
      }
    }

    const pipelines = await listPipelines()
    const chosen = pipelines.find((p) => p.id === String(b.pipelineId ?? ''))?.id
    // Een geldige keuze wint van het merk van de lead; anders de lead, anders
    // de standaard. Een onbekend id wordt genegeerd, niet overgenomen.
    pipelineId = chosen ?? pipelineId ?? await defaultPipelineId()

    // 2) Afspraak vastleggen. De exclusion-constraint in de database is de
    //    laatste rem tegen dubbel boeken bij gelijktijdige verzoeken.
    const { data: appt, error: apptErr } = await admin.from('sales_appointments').insert({
      sales_client_id: salesClientId,
      pipeline_id: pipelineId,
      lead_id: leadId,
      contact_id: contactId,
      setter_id: actor.id,
      calendar_id: ownerId,
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
      const ev = await createEvent(ownerId, {
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

    // 4b) Boek je een lead voor het ándere merk, dan hoort die lead daar
    //     voortaan ook thuis: blijkt aan de telefoon dat iemand uit de ene
    //     pipeline beter bij het andere past, dan verhuist hij mee.
    let leadMoveWarning: string | null = null
    if (leadId && pipelineId && leadPipelineId && pipelineId !== leadPipelineId) {
      const moved = await moveLeadToPipeline(leadId, pipelineId)
      if (moved.ok) {
        await logLeadEvent(leadId, {
          kind: 'system', body: 'Verhuisd naar het merk van de geboekte afspraak',
          actorId: actor.id, actorEmail: actor.email ?? null,
        })
      } else {
        leadMoveWarning = `De afspraak staat geboekt, maar de lead kon niet mee verhuizen: ${moved.error}`
      }
    }

    // 5) Herinneringsmail inplannen bij Resend op het juiste moment. Mislukt
    //    dat, dan blijft de afspraak gewoon staan — een boeking mag hier nooit
    //    op stuklopen. Maar we ZEGGEN het wel: een herinnering die er stil niet
    //    komt, ontdek je anders pas als de prospect niet is opgedaagd.
    let reminderWarning: string | null = null
    try {
      const r = await scheduleReminderFor(appt.id as string)
      if (r.outcome === 'error') {
        reminderWarning = `De herinneringsmail kon niet ingepland worden: ${r.error ?? 'onbekende fout'}`
      } else if (r.outcome === 'skipped') {
        reminderWarning = `Er gaat geen herinneringsmail uit: ${r.error ?? 'onbekende reden'}`
      }
      // 'too_far' is normaal: die wordt later automatisch ingepland.
    } catch (e) {
      reminderWarning = `De herinneringsmail kon niet ingepland worden: ${e instanceof Error ? e.message : 'onbekende fout'}`
    }

    const meta = requestMeta(req)
    await logAudit({
      action: 'sales.appointment.book', entityType: 'sales_appointment', entityId: appt.id as string,
      summary: `Verkoop: afspraak geboekt voor ${client.name}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })

    return NextResponse.json({
      ok: true, id: appt.id, meetUrl,
      reminderWarning: reminderWarning ?? leadMoveWarning,
    })
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
      .select('id, sales_client_id, external_event_id, status, calendar_id, lead_id, starts_at, ends_at')
      .eq('id', id).maybeSingle()
    if (!appt) return NextResponse.json({ error: 'Afspraak niet gevonden' }, { status: 404 })
    if (appt.status === 'cancelled') return NextResponse.json({ error: 'Deze afspraak is geannuleerd' }, { status: 400 })

    const pipeline = await getOrCreateSalesOrg()
    await assertBookable(appt.sales_client_id as string, start, end, (appt.calendar_id as string | null), id)

    // Lead wisselen mag mee in dezelfde bewerking. De afspraak erft dan ook het
    // merk van die lead — anders zou de verkeerde brochure meegaan.
    const patch: Record<string, unknown> = {
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(end).toISOString(),
    }
    // Merk mag ook bij het verzetten nog wisselen.
    const allPipelines = await listPipelines()
    const wantedPipeline = allPipelines.find((p) => p.id === String(b.pipelineId ?? ''))?.id

    let newLeadId: string | null | undefined
    if ('leadId' in b) {
      newLeadId = b.leadId ? String(b.leadId) : null
      if (newLeadId) {
        const { data: lead } = await admin.from('sales_leads')
          .select('id, contact_id, pipeline_id, sales_contacts ( email )')
          .eq('id', newLeadId).eq('sales_client_id', appt.sales_client_id as string).maybeSingle()
        if (!lead) return NextResponse.json({ error: 'Deze lead staat niet in de pipeline' }, { status: 400 })
        patch.lead_id = newLeadId
        patch.contact_id = (lead as { contact_id: string | null }).contact_id
        patch.pipeline_id = (lead as { pipeline_id: string | null }).pipeline_id
        const leadEmail = (lead as { sales_contacts?: { email?: string | null } | null }).sales_contacts?.email ?? null
        if (leadEmail) patch.attendee_email = leadEmail
      } else {
        patch.lead_id = null
      }
    }
    if (typeof b.attendeeEmail === 'string') {
      patch.attendee_email = b.attendeeEmail.trim() || null
    }
    // Een uitdrukkelijke merkkeuze wint van wat de lead zegt.
    if (wantedPipeline) patch.pipeline_id = wantedPipeline

    const { error } = await admin.from('sales_appointments').update(patch).eq('id', id)
    if (error) {
      const dup = /exclusion|overlap/i.test(error.message)
      return NextResponse.json({ error: dup ? 'Er staat al een afspraak op dit moment.' : 'Verplaatsen mislukt' }, { status: 409 })
    }

    // De herinnering hoort bij het OUDE uur: intrekken en opnieuw inplannen.
    // Was hij al vertrokken, dan sturen we er BEWUST geen tweede achteraan —
    // twee mails met verschillende uren erin is erger dan één verouderde.
    let reminderNote: string | null = null
    try {
      const { wasSent } = await cancelReminderFor(id)
      if (wasSent) {
        reminderNote = 'De herinneringsmail was al vertrokken met het oude uur. Er gaat geen tweede uit — laat de prospect zelf even weten dat het verzet is.'
      } else {
        await scheduleReminderFor(id)
      }
    } catch { /* vangnet volgt */ }

    if (appt.external_event_id) {
      try {
        await moveEvent(appt.calendar_id as string, appt.external_event_id as string, start, end, pipeline.timezone)
      } catch (e) {
        return NextResponse.json({ error: `Verplaatst in de app, maar de agenda gaf een fout: ${e instanceof Error ? e.message : 'onbekend'}` }, { status: 502 })
      }
    }

    const meta2 = requestMeta(req)
    await logAudit({
      action: 'sales.appointment.move', entityType: 'sales_appointment', entityId: id,
      summary: `Verkoop: afspraak verzet naar ${new Date(start).toISOString()}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta2.ip, userAgent: meta2.userAgent,
    })

    return NextResponse.json({ ok: true, reminderNote })
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
      .select('id, sales_client_id, external_event_id, calendar_id').eq('id', id).maybeSingle()
    if (!appt) return NextResponse.json({ error: 'Afspraak niet gevonden' }, { status: 404 })

    await admin.from('sales_appointments').update({ status: 'cancelled' }).eq('id', id)
    // Een ingeplande herinnering voor een afgezegde afspraak moet weg.
    try { await cancelReminderFor(id) } catch { /* niet blokkerend */ }
    if (appt.external_event_id) {
      await deleteEvent(appt.calendar_id as string, appt.external_event_id as string)
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
