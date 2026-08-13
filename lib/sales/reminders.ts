import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail, baseUrl } from '@/lib/email'
import { listPipelines, type SalesPipeline } from '@/lib/sales/pipelines'

// Herinneringsmail naar de prospect vóór een geboekte afspraak (§8).
//
// Wanneer gaat hij uit?
//   • normaal: 24 uur voor de afspraak — dus de dag ervoor, op hetzelfde uur;
//   • is er bij het boeken minder dan 24 uur te gaan, dan een kwartier na het
//     inboeken. Dat kwartier is er om nog te kunnen ingrijpen als er iets fout
//     geboekt is.
//
// Per afspraak gaat dit maximaal één keer uit; dat wordt afgedwongen met een
// unieke index op (afspraak, soort), niet met een tijdvenstertruc. Mislukt het
// versturen, dan wordt het bij de volgende ronde opnieuw geprobeerd.
//
// De brochure van het juiste merk gaat mee als bijlage: een lead uit de
// NextGenSolutions-pipeline krijgt de NextGenSolutions-one-pager.

export type ReminderResult = { checked: number; sent: number; skipped: number; errors: string[] }

const REMINDER_KIND = 'day_before'
const LAST_MINUTE_DELAY_MS = 15 * 60 * 1000

type ApptRow = {
  id: string; starts_at: string; created_at: string
  attendee_email: string | null; meet_url: string | null
  pipeline_id: string | null; lead_id: string | null; calendar_id: string | null
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

/** Stuurt de herinneringen die nu aan de beurt zijn. */
export async function runSalesReminders(now = new Date()): Promise<ReminderResult> {
  const admin = createAdminSupabaseClient()
  const out: ReminderResult = { checked: 0, sent: 0, skipped: 0, errors: [] }

  const pipelines = await listPipelines()
  const byPipeline = new Map(pipelines.map((p) => [p.id, p]))
  if (pipelines.length === 0) return out

  const { data: clientRow } = await admin
    .from('sales_clients').select('id, timezone').neq('status', 'archived')
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  const tz = (clientRow as { timezone?: string } | null)?.timezone ?? 'Europe/Brussels'

  // Alles wat nog moet plaatsvinden binnen de komende 24 uur plus een marge:
  // verder vooruit is de herinnering per definitie nog niet aan de beurt.
  const horizon = new Date(now.getTime() + 25 * 3600 * 1000).toISOString()
  const { data: apptRows } = await admin
    .from('sales_appointments')
    .select('id, starts_at, created_at, attendee_email, meet_url, pipeline_id, lead_id, calendar_id')
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon)

  const appts = (apptRows ?? []) as ApptRow[]
  out.checked = appts.length
  if (appts.length === 0) return out

  const { data: sentRows } = await admin
    .from('sales_appointment_reminders')
    .select('appointment_id')
    .in('appointment_id', appts.map((a) => a.id))
  const alreadySent = new Set(
    ((sentRows ?? []) as { appointment_id: string }[]).map((r) => r.appointment_id),
  )

  // Namen van de agenda-eigenaars, om de mail te ondertekenen met de persoon
  // die de prospect straks effectief spreekt.
  const { data: owners } = await admin
    .from('sales_calendar_connections').select('id, name')
  const ownerName = new Map(
    ((owners ?? []) as { id: string; name: string | null }[]).map((o) => [o.id, o.name]),
  )

  for (const a of appts) {
    if (alreadySent.has(a.id)) continue
    if (!a.attendee_email) { out.skipped++; continue }   // geen adres → niets te sturen

    const pipeline = a.pipeline_id ? byPipeline.get(a.pipeline_id) : undefined
    // Zonder merk weten we niet welke brochure erbij hoort. Dan liever niets
    // sturen dan de verkeerde one-pager.
    if (!pipeline) { out.skipped++; continue }
    if (!pipeline.reminder_enabled) { out.skipped++; continue }

    const startsMs = new Date(a.starts_at).getTime()
    const createdMs = new Date(a.created_at).getTime()
    if (now.getTime() < dueAt(startsMs, createdMs)) continue     // nog niet aan de beurt

    const hour = hourText(a.starts_at, tz)
    const today = sameDay(new Date(a.starts_at), now, tz)
    const signer = (a.calendar_id ? ownerName.get(a.calendar_id) : null) ?? null

    const lines = reminderBody({ hour, today, signer })
    const text = lines.join('\n')
    const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">${
      lines.map((l) => (l === '' ? '<br>' : `<div>${escapeHtml(l)}</div>`)).join('')
    }</div>`

    const res = await sendEmail({
      to: a.attendee_email,
      subject: today ? `Tot straks om ${hour}` : `Tot morgen om ${hour}`,
      text, html,
      from: pipeline.reminder_from,
      replyTo: pipeline.reminder_reply_to,
      attachments: attachmentFor(pipeline),
    })

    if (res.ok) {
      // Pas ná een geslaagde verzending vastleggen, zodat een mislukte poging
      // bij de volgende ronde opnieuw geprobeerd wordt.
      await admin.from('sales_appointment_reminders')
        .insert({ appointment_id: a.id, days_before: 1, kind: REMINDER_KIND })
      out.sent++
    } else {
      out.errors.push(`${pipeline.name}: ${res.error ?? 'versturen mislukt'}`)
    }
  }

  return out
}
