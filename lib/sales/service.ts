import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { STAGES } from '@/lib/sales/stages'
import { companyDedupeKey, normalizePhone } from '@/lib/sales/dedupe'
import {
  bookableSegments, type Interval, type WorkRule, type WorkException,
} from '@/lib/sales/availability'
import { fetchBusy } from '@/lib/sales/google-calendar'

export type SalesClient = {
  id: string; name: string; timezone: string; status: string
  buffer_before_min: number; buffer_after_min: number
  min_notice_min: number; max_horizon_days: number; max_per_day: number
  slot_interval_min: number; default_duration_min: number
}

export async function getSalesClient(id: string): Promise<SalesClient | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin.from('sales_clients').select('*').eq('id', id).maybeSingle()
  return (data as SalesClient) ?? null
}

/**
 * DE pipeline. We bellen niet voor andere bedrijven: er is één algemene
 * pipeline van NextGenMedia zelf, waarin onze appointment setters werken.
 *
 * De onderliggende tabel heet nog `sales_clients` — dat blijft zo, want alle
 * leads, agenda's, werkuren en afspraken hangen aan die rij. In de app is er
 * geen klantbegrip meer: dit wordt nergens getoond of gekozen.
 *
 * Bestond er al een rij (uit de eerste opzet), dan gebruiken we die verder —
 * zo blijft bestaande data zichtbaar. Bij meerdere rijen kiezen we die met een
 * gekoppelde agenda, anders de oudste. Er wordt nooit iets verwijderd.
 */
export async function getOrCreatePipeline(): Promise<SalesClient> {
  const admin = createAdminSupabaseClient()

  const { data: rows } = await admin
    .from('sales_clients').select('*').neq('status', 'archived')
    .order('created_at', { ascending: true })
  const list = (rows ?? []) as SalesClient[]

  if (list.length === 1) return list[0]
  if (list.length > 1) {
    const { data: conns } = await admin
      .from('sales_calendar_connections').select('sales_client_id')
    const withCal = new Set((conns ?? []).map((c) => (c as { sales_client_id: string }).sales_client_id))
    return list.find((c) => withCal.has(c.id)) ?? list[0]
  }

  const { error } = await admin.from('sales_clients')
    .insert({ name: 'NextGenMedia', timezone: 'Europe/Brussels' })
  if (error) throw new Error(error.message)

  // Bewust opnieuw de oudste ophalen in plaats van de zojuist ingevoegde rij:
  // botsen twee gelijktijdige eerste verzoeken, dan komen ze zo allebei op
  // dezelfde pipeline uit in plaats van elk op hun eigen rij.
  const { data: after } = await admin
    .from('sales_clients').select('*').neq('status', 'archived')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!after) throw new Error('Pipeline aanmaken mislukt')

  await ensureStages(after.id as string)
  await seedDefaultAvailability(after.id as string)
  return after as SalesClient
}

/** Elke klant krijgt dezelfde vaste fase-set (§3). Idempotent. */
export async function ensureStages(salesClientId: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const rows = STAGES.map((s) => ({
    sales_client_id: salesClientId,
    key: s.key, label: s.label, position: s.position,
    is_won: 'isWon' in s ? !!s.isWon : false,
    is_lost: 'isLost' in s ? !!s.isLost : false,
  }))
  await admin.from('sales_stages').upsert(rows, { onConflict: 'sales_client_id,key' })
}

/** Standaard werkuren voor een nieuwe klant: ma–vr 09:00–17:00. */
export async function seedDefaultAvailability(salesClientId: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { count } = await admin.from('sales_availability_rules')
    .select('id', { count: 'exact', head: true }).eq('sales_client_id', salesClientId)
  if ((count ?? 0) > 0) return
  await admin.from('sales_availability_rules').insert(
    [0, 1, 2, 3, 4].map((weekday) => ({ sales_client_id: salesClientId, weekday, start_time: '09:00', end_time: '17:00' })),
  )
}

export type NewLeadInput = {
  salesClientId: string
  company: { name: string; website?: string; sector?: string; employees?: number; city?: string; region?: string; country?: string; phone?: string; linkedin?: string }
  contact: { name?: string; role?: string; email?: string; phone?: string; mobile?: string; linkedin?: string }
  labels?: string[]
}

export type NewLeadResult =
  | { ok: true; leadId: string }
  | { ok: false; error: string; existingLeadId?: string }

/**
 * Lead aanmaken met ontdubbeling op bedrijf (§11): bestaat er al een ACTIEVE
 * lead voor dit bedrijf bij deze klant, dan maken we er geen tweede maar
 * verwijzen we naar de bestaande.
 */
export async function createLead(input: NewLeadInput): Promise<NewLeadResult> {
  const admin = createAdminSupabaseClient()
  const name = input.company.name.trim()
  if (!name) return { ok: false, error: 'Bedrijfsnaam is verplicht' }

  const dedupe = companyDedupeKey(name, input.company.website)

  // Bestaat het bedrijf al bij deze klant?
  const { data: existingCompany } = await admin
    .from('sales_companies').select('id')
    .eq('sales_client_id', input.salesClientId).eq('dedupe_key', dedupe).maybeSingle()

  let companyId = existingCompany?.id as string | undefined

  if (companyId) {
    const { data: openLead } = await admin
      .from('sales_leads').select('id')
      .eq('sales_client_id', input.salesClientId).eq('company_id', companyId)
      .is('archived_at', null).maybeSingle()
    if (openLead) {
      return { ok: false, error: `Er staat al een lead voor ${name} in deze pipeline.`, existingLeadId: openLead.id as string }
    }
  } else {
    const { data: created, error } = await admin.from('sales_companies').insert({
      sales_client_id: input.salesClientId,
      name,
      website: input.company.website || null,
      dedupe_key: dedupe,
      sector: input.company.sector || null,
      employees: input.company.employees ?? null,
      city: input.company.city || null,
      region: input.company.region || null,
      country: input.company.country || null,
      phone: input.company.phone || null,
      linkedin: input.company.linkedin || null,
    }).select('id').single()
    if (error || !created) return { ok: false, error: error?.message ?? 'Bedrijf aanmaken mislukt' }
    companyId = created.id as string
  }

  const phone = input.contact.phone || input.contact.mobile || input.company.phone || null
  const { data: contact } = await admin.from('sales_contacts').insert({
    company_id: companyId,
    name: input.contact.name || null,
    role: input.contact.role || null,
    email: input.contact.email || null,
    phone: input.contact.phone || null,
    mobile: input.contact.mobile || null,
    linkedin: input.contact.linkedin || null,
    phone_digits: normalizePhone(phone),
  }).select('id').single()

  const { data: lead, error: leadErr } = await admin.from('sales_leads').insert({
    sales_client_id: input.salesClientId,
    company_id: companyId,
    contact_id: contact?.id ?? null,
    stage_key: 'to_contact',
    labels: input.labels ?? [],
  }).select('id').single()
  if (leadErr || !lead) return { ok: false, error: leadErr?.message ?? 'Lead aanmaken mislukt' }

  return { ok: true, leadId: lead.id as string }
}

/** Gebeurtenis op de tijdlijn van een lead (belpoging, notitie, fasewissel). */
export async function logLeadEvent(leadId: string, e: {
  kind: 'call' | 'note' | 'stage' | 'system'
  body?: string | null
  fromStage?: string | null
  toStage?: string | null
  actorId?: string | null
  actorEmail?: string | null
}): Promise<void> {
  const admin = createAdminSupabaseClient()
  await admin.from('sales_lead_events').insert({
    lead_id: leadId, kind: e.kind, body: e.body ?? null,
    from_stage: e.fromStage ?? null, to_stage: e.toStage ?? null,
    actor_id: e.actorId ?? null, actor_email: e.actorEmail ?? null,
  })
}

export type CalendarOwner = {
  id: string; name: string; account_email: string | null; status: string; active: boolean
}

export type CalendarData = {
  client: SalesClient
  owners: CalendarOwner[]              // de agenda's (personen) van deze klant
  ownerId: string | null               // welke agenda is getoond
  segments: Interval[]                 // WIT = boekbaar
  appointments: {
    id: string; starts_at: string; ends_at: string; status: string
    lead_id: string | null; company: string | null; contact: string | null
    calendar_id: string | null
  }[]
  connected: boolean
}

/** Alle gekoppelde agenda's (personen) van een klant. */
export async function listOwners(salesClientId: string): Promise<CalendarOwner[]> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('sales_calendar_connections')
    .select('id, name, account_email, status, active')
    .eq('sales_client_id', salesClientId)
    .order('name')
  return ((data ?? []) as CalendarOwner[]).filter((o) => o.active !== false)
}

/**
 * Alles wat de kalender nodig heeft voor één venster. De witte segmenten worden
 * hier op de SERVER berekend en zo doorgegeven aan de UI, zodat tekenen en
 * hervalideren gegarandeerd dezelfde bron gebruiken.
 */
export async function loadCalendar(
  salesClientId: string, from: number, to: number, ownerId?: string | null,
): Promise<CalendarData | null> {
  const admin = createAdminSupabaseClient()
  const client = await getSalesClient(salesClientId)
  if (!client) return null

  const owners = await listOwners(salesClientId)
  // Geen agenda gekozen → de eerste. Zo werkt het scherm meteen bij één agenda.
  const active = owners.find((o) => o.id === ownerId) ?? owners[0] ?? null

  const [{ data: rules }, { data: exceptions }, { data: appts }] = await Promise.all([
    admin.from('sales_availability_rules').select('weekday, start_time, end_time, calendar_id').eq('sales_client_id', salesClientId),
    admin.from('sales_availability_exceptions').select('date, closed, start_time, end_time, calendar_id').eq('sales_client_id', salesClientId),
    admin.from('sales_appointments')
      .select('id, starts_at, ends_at, status, lead_id, contact_id, calendar_id')
      .eq('sales_client_id', salesClientId).neq('status', 'cancelled')
      // Ruime marge: een afspraak die vóór het venster start kan erin doorlopen.
      .gte('starts_at', new Date(from - 86400000).toISOString())
      .lte('starts_at', new Date(to + 86400000).toISOString()),
  ])

  type Row = { calendar_id?: string | null }
  /**
   * Regels voor déze agenda. Heeft de persoon eigen werkuren, dan gelden die;
   * anders vallen we terug op de regels van de klant (calendar_id NULL). Zo
   * hoef je niet voor elke persoon alles opnieuw in te vullen.
   */
  const forOwner = <T extends Row>(list: T[] | null): T[] => {
    const all = list ?? []
    const own = active ? all.filter((r) => r.calendar_id === active.id) : []
    return own.length > 0 ? own : all.filter((r) => !r.calendar_id)
  }

  const allAppts = (appts ?? []) as {
    id: string; starts_at: string; ends_at: string; status: string
    lead_id: string | null; contact_id: string | null; calendar_id: string | null
  }[]
  // Alleen de afspraken van déze persoon blokkeren zijn agenda; een afspraak
  // van Marco mag Bram niet in de weg zitten.
  const appointments = active
    ? allAppts.filter((a) => a.calendar_id === active.id || a.calendar_id === null)
    : allAppts

  const busy = active ? await fetchBusy(active.id, from, to) : []

  const segments = bookableSegments({
    from, to, tz: client.timezone,
    rules: forOwner(rules as (WorkRule & Row)[] | null) as WorkRule[],
    exceptions: forOwner(exceptions as (WorkException & Row)[] | null) as WorkException[],
    busy,
    appointments: appointments.map((a) => ({ start: new Date(a.starts_at).getTime(), end: new Date(a.ends_at).getTime() })),
    booking: {
      bufferBeforeMin: client.buffer_before_min,
      bufferAfterMin: client.buffer_after_min,
      minNoticeMin: client.min_notice_min,
      maxHorizonDays: client.max_horizon_days,
      slotIntervalMin: client.slot_interval_min,
    },
  })

  // Namen erbij voor de blokjes in de kalender.
  const leadIds = appointments.map((a) => a.lead_id).filter(Boolean) as string[]
  const nameByLead = new Map<string, { company: string | null; contact: string | null }>()
  if (leadIds.length) {
    const { data: leads } = await admin
      .from('sales_leads')
      .select('id, sales_companies(name), sales_contacts(name)')
      .in('id', leadIds)
    for (const l of (leads ?? []) as { id: string; sales_companies?: { name?: string } | null; sales_contacts?: { name?: string } | null }[]) {
      nameByLead.set(l.id, { company: l.sales_companies?.name ?? null, contact: l.sales_contacts?.name ?? null })
    }
  }

  return {
    client,
    owners,
    ownerId: active?.id ?? null,
    segments,
    connected: active?.status === 'connected',
    appointments: appointments.map((a) => ({
      id: a.id, starts_at: a.starts_at, ends_at: a.ends_at, status: a.status, lead_id: a.lead_id,
      calendar_id: a.calendar_id,
      company: a.lead_id ? nameByLead.get(a.lead_id)?.company ?? null : null,
      contact: a.lead_id ? nameByLead.get(a.lead_id)?.contact ?? null : null,
    })),
  }
}
