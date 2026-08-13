import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail, cancelScheduledEmail, baseUrl, SCHEDULE_HORIZON_MS } from '@/lib/email'
import { listPipelines, type SalesPipeline } from '@/lib/sales/pipelines'

// Herinneringsmail naar de prospect vóór een geboekte afspraak (§8).
//
// Wanneer gaat hij uit?
//   • normaal: 24 uur voor de afspraak — dus de dag ervoor, op hetzelfde uur;
//   • is er bij het boeken minder dan 24 uur te gaan, dan een kwartier na het
//     inboeken. Dat kwartier is er om nog te kunnen ingrijpen als er iets fout
//     geboekt is.
//
// HOE het op tijd vertrekt: we PLANNEN de mail bij Resend in op precies dat
// moment (die houdt hem tot 72 uur vast). Er hoeft dus geen cron elk kwartier
// te draaien — dat kan ook niet op een Vercel Hobby-plan, waar één cron per dag
// het maximum is. De dagelijkse cron is enkel een vangnet voor afspraken die
// verder dan 72 uur vooruit geboekt zijn: die worden ingepland zodra ze binnen
// die horizon komen.
//
// Wordt de afspraak geannuleerd of verplaatst, dan halen we de ingeplande mail
// weer weg. Een herinnering voor een afgezegde afspraak is erger dan geen.
//
// Per afspraak gaat dit maximaal één keer uit; dat wordt afgedwongen met een
// unieke index, niet met een tijdvenstertruc.

export type ReminderResult = { checked: number; sent: number; skipped: number; errors: string[] }

const LAST_MINUTE_DELAY_MS = 15 * 60 * 1000

type ApptRow = {
  id: string; starts_at: string; created_at: string; status: string
  attendee_email: string | null
  pipeline_id: string | null; calendar_id: string | null
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Alleen het uur, in de tijdzone van de afspraak. */
function hourText(startsAt: string, tz: string): string {
  return new Date(startsAt).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: tz })
}

/** Zelfde kalenderdag in die tijdzone? Bepaalt "vandaag" of "morgen". */
function sameDay(a: Date, b: Date, tz: string): boolean {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' })
  return f.format(a) === f.format(b)
}

/**
 * Wanneer moet deze herinnering de deur uit?
 * Geëxporteerd omdat dit de enige echte regel in dit bestand is en apart
 * getest hoort te kunnen worden.
 */
export function dueAt(startsAtMs: number, createdAtMs: number): number {
  const dayBefore = startsAtMs - 24 * 3600 * 1000
  // Al binnen het etmaal geboekt → een kwartier na het inboeken.
  return dayBefore <= createdAtMs ? createdAtMs + LAST_MINUTE_DELAY_MS : dayBefore
}

/** De mailtekst. Bewust exact zoals afgesproken, enkel uur en dag ingevuld. */
export function reminderBody(opts: { hour: string; today: boolean; signer: string | null }): string[] {
  return [
    'Hey!',
    '',
    `${opts.today ? 'Vandaag' : 'Morgen'} om ${opts.hour} zien we elkaar. We kijken er naar uit!`,
    '',
    'Ik kom vooral luisteren naar wat jullie doen, hoe het loopt en waar jullie naartoe willen. ' +
      'Van daaruit zien we of we iets voor jullie kunnen betekenen.',
    '',
    'In bijlage stuur ik alvast een korte uitleg mee over ons. Wie we zijn, wat we doen en wat jij ' +
      'eruit kan halen. Zo weet je op voorhand met wie je aan tafel zit.',
    '',
    `Tot ${opts.today ? 'straks' : 'morgen'}!`,
    '',
    'Met vriendelijke groeten',
    ...(opts.signer ? [opts.signer] : []),
  ]
}

/** Brochure als bijlage. Relatief pad wordt hier pas een volledige URL. */
function attachmentFor(p: SalesPipeline): { filename: string; path: string }[] {
  if (!p.brochure_url) return []
  const url = p.brochure_url.startsWith('http') ? p.brochure_url : `${baseUrl()}${p.brochure_url}`
  return [{ filename: p.brochure_filename || 'Kennismaking.pdf', path: url }]
}

type ScheduleOutcome = 'scheduled' | 'skipped' | 'too_far' | 'error'

/**
 * Plant de herinnering voor één afspraak in bij Resend.
 * Idempotent: staat er al een herinnering voor deze afspraak, dan gebeurt er
 * niets. Ligt het verzendmoment verder dan 72 uur weg, dan doen we nog niets —
 * de dagelijkse cron pikt hem later op.
 */
export async function scheduleReminderFor(
  appointmentId: string, now = new Date(),
): Promise<{ outcome: ScheduleOutcome; error?: string }> {
  const admin = createAdminSupabaseClient()

  const { data } = await admin.from('sales_appointments')
    .select('id, starts_at, created_at, status, attendee_email, pipeline_id, calendar_id')
    .eq('id', appointmentId).maybeSingle()
  const a = data as ApptRow | null
  if (!a || a.status !== 'scheduled') return { outcome: 'skipped' }
  if (!a.attendee_email) return { outcome: 'skipped' }       // geen adres → niets te sturen

  const { data: existing } = await admin.from('sales_appointment_reminders')
    .select('id').eq('appointment_id', a.id).maybeSingle()
  if (existing) return { outcome: 'skipped' }                 // al ingepland of verstuurd

  const pipelines = await listPipelines()
  const pipeline = pipelines.find((p) => p.id === a.pipeline_id)
  // Zonder merk weten we niet welke brochure erbij hoort. Dan liever niets
  // sturen dan de verkeerde one-pager.
  if (!pipeline || !pipeline.reminder_enabled) return { outcome: 'skipped' }

  const startsMs = new Date(a.starts_at).getTime()
  const due = dueAt(startsMs, new Date(a.created_at).getTime())
  if (due >= startsMs) return { outcome: 'skipped' }          // zou ná de afspraak vallen
  if (due - now.getTime() > SCHEDULE_HORIZON_MS) return { outcome: 'too_far' }

  const { data: org } = await admin.from('sales_clients')
    .select('timezone').order('created_at', { ascending: true }).limit(1).maybeSingle()
  const tz = (org as { timezone?: string } | null)?.timezone ?? 'Europe/Brussels'

  const { data: owner } = a.calendar_id
    ? await admin.from('sales_calendar_connections').select('name').eq('id', a.calendar_id).maybeSingle()
    : { data: null }
  const signer = (owner as { name?: string | null } | null)?.name ?? null

  const hour = hourText(a.starts_at, tz)
  // "Vandaag" of "Morgen" hangt af van de dag waarop de mail VERTREKT, niet van
  // vandaag: hij kan tot 72 uur vooruit ingepland worden.
  const today = sameDay(new Date(a.starts_at), new Date(Math.max(due, now.getTime())), tz)

  const lines = reminderBody({ hour, today, signer })
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">${
    lines.map((l) => (l === '' ? '<br>' : `<div>${escapeHtml(l)}</div>`)).join('')
  }</div>`

  const res = await sendEmail({
    to: a.attendee_email,
    subject: today ? `Tot straks om ${hour}` : `Tot morgen om ${hour}`,
    text: lines.join('\n'), html,
    from: pipeline.reminder_from,
    replyTo: pipeline.reminder_reply_to,
    attachments: attachmentFor(pipeline),
    // In het verleden inplannen mag niet; dan meteen versturen.
    scheduledAt: due > now.getTime() ? new Date(due).toISOString() : null,
  })
  if (!res.ok) return { outcome: 'error', error: res.error }

  // Pas ná een geslaagde inplanning vastleggen, zodat een mislukte poging
  // morgen opnieuw geprobeerd wordt.
  await admin.from('sales_appointment_reminders').insert({
    appointment_id: a.id, days_before: 1, kind: 'day_before',
    resend_id: res.id ?? null, scheduled_for: new Date(due).toISOString(),
  })
  return { outcome: 'scheduled' }
}

/**
 * Herinnering weer intrekken — bij annuleren of verplaatsen. De rij verdwijnt
 * ook, zodat een verplaatste afspraak gewoon opnieuw ingepland kan worden.
 */
export async function cancelReminderFor(appointmentId: string): Promise<void> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin.from('sales_appointment_reminders')
    .select('id, resend_id').eq('appointment_id', appointmentId).maybeSingle()
  const row = data as { id: string; resend_id: string | null } | null
  if (!row) return
  if (row.resend_id) await cancelScheduledEmail(row.resend_id)
  await admin.from('sales_appointment_reminders').delete().eq('id', row.id)
}

/**
 * Dagelijks vangnet: afspraken die verder dan 72 uur vooruit geboekt zijn,
 * konden bij het boeken nog niet ingepland worden. Zodra hun verzendmoment
 * binnen die horizon valt, gebeurt dat hier alsnog.
 */
export async function runSalesReminders(now = new Date()): Promise<ReminderResult> {
  const admin = createAdminSupabaseClient()
  const out: ReminderResult = { checked: 0, sent: 0, skipped: 0, errors: [] }

  // Ruim venster: alles wat binnen ~4 dagen begint kan een verzendmoment binnen
  // de 72 uur hebben.
  const horizon = new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString()
  const { data } = await admin.from('sales_appointments')
    .select('id')
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon)

  const ids = ((data ?? []) as { id: string }[]).map((r) => r.id)
  out.checked = ids.length

  for (const id of ids) {
    const r = await scheduleReminderFor(id, now)
    if (r.outcome === 'scheduled') out.sent++
    else if (r.outcome === 'error') out.errors.push(r.error ?? 'inplannen mislukt')
    else out.skipped++
  }
  return out
}
