import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

// Herinneringsmails naar prospects (§8).
//
// OPT-IN: dit staat standaard uit (lege reminder_days_before). Staat die lijst
// leeg, dan gaat er nooit een mail uit — een prospect krijgt niets automatisch.
//
// De mail is bewust kaal en zakelijk: enkel datum, uur en de Meet-link,
// ondertekend met de ingestelde naam. Reply-to gaat naar het opgegeven adres,
// zodat een antwoord bij de juiste persoon terechtkomt.

export type ReminderResult = { checked: number; sent: number; skipped: number; errors: string[] }

type ApptRow = {
  id: string; starts_at: string; ends_at: string; attendee_email: string | null
  meet_url: string | null; sales_client_id: string
}
type ClientRow = {
  id: string; name: string; timezone: string
  contact_name: string | null; contact_email: string | null
  reminder_days_before: number[] | null; reminder_sender_name: string | null
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Datum + tijd in de tijdzone van de klant, in gewone taal. */
function whenText(startsAt: string, tz: string): string {
  const d = new Date(startsAt)
  const date = d.toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz })
  const time = d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit', timeZone: tz })
  return `${date} om ${time}`
}

/**
 * Stuurt de herinneringen die vandaag aan de beurt zijn.
 * Een herinnering voor (afspraak, aantal dagen) gaat maar één keer uit; dat
 * wordt afgedwongen met een unieke index, niet met een tijdvenster-truc.
 */
export async function runSalesReminders(now = new Date()): Promise<ReminderResult> {
  const admin = createAdminSupabaseClient()
  const out: ReminderResult = { checked: 0, sent: 0, skipped: 0, errors: [] }

  // Enkel wanneer dit expliciet aan staat.
  const { data: clientRows, error: cErr } = await admin
    .from('sales_clients').select('*').neq('status', 'archived')
  if (cErr) { out.errors.push(cErr.message); return out }

  const clients = (clientRows ?? []) as ClientRow[]
  const active = clients.filter((c) => (c.reminder_days_before ?? []).length > 0)
  if (active.length === 0) return out

  // Ruim venster ophalen: de verste herinnering bepaalt hoe ver vooruit we kijken.
  const maxDays = Math.max(...active.flatMap((c) => c.reminder_days_before ?? [0]))
  const horizon = new Date(now.getTime() + (maxDays + 1) * 86400000).toISOString()

  const { data: apptRows } = await admin
    .from('sales_appointments')
    .select('id, starts_at, ends_at, attendee_email, meet_url, sales_client_id')
    .eq('status', 'scheduled')
    .gte('starts_at', now.toISOString())
    .lte('starts_at', horizon)
    .in('sales_client_id', active.map((c) => c.id))

  const appts = (apptRows ?? []) as ApptRow[]
  out.checked = appts.length
  if (appts.length === 0) return out

  // Al verstuurde herinneringen in één keer ophalen.
  const { data: sentRows } = await admin
    .from('sales_appointment_reminders')
    .select('appointment_id, days_before')
    .in('appointment_id', appts.map((a) => a.id))
  const alreadySent = new Set(
    ((sentRows ?? []) as { appointment_id: string; days_before: number }[])
      .map((r) => `${r.appointment_id}|${r.days_before}`),
  )

  const byClient = new Map(active.map((c) => [c.id, c]))

  for (const a of appts) {
    const client = byClient.get(a.sales_client_id)
    if (!client) continue
    if (!a.attendee_email) { out.skipped++; continue }   // geen adres → niets te sturen

    const startsMs = new Date(a.starts_at).getTime()
    const daysUntil = (startsMs - now.getTime()) / 86400000

    for (const daysBefore of client.reminder_days_before ?? []) {
      if (alreadySent.has(`${a.id}|${daysBefore}`)) continue
      // Aan de beurt zodra we binnen dat aantal dagen zitten. Een gemiste dag
      // (cron uitgevallen) haalt zichzelf zo alsnog in.
      if (daysUntil > daysBefore) continue

      const signer = client.reminder_sender_name || client.contact_name || client.name
      const when = whenText(a.starts_at, client.timezone)
      const lines = [
        'Beste,',
        '',
        `Een korte herinnering aan onze afspraak op ${when}.`,
        a.meet_url ? `Deelnemen kan via: ${a.meet_url}` : '',
        '',
        'Past het niet meer? Laat het gerust weten door op deze mail te antwoorden.',
        '',
        'Met vriendelijke groeten,',
        signer,
        // Bedrijfsnaam alleen als die iets toevoegt (anders staat er twee keer
        // hetzelfde onder de mail).
        signer === client.name ? '' : client.name,
      ].filter((l) => l !== null)
      while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

      const text = lines.join('\n')
      // Bewust kale opmaak: geen logo, geen huisstijl, niets dat naar ons wijst.
      const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111">${
        lines.map((l) => (l === '' ? '<br>' : `<div>${escapeHtml(l)}</div>`)).join('')
      }</div>`

      const res = await sendEmail({
        to: a.attendee_email,
        subject: `Herinnering: afspraak ${when}`,
        text, html,
        replyTo: client.contact_email ?? null,
      })

      if (res.ok) {
        // Pas ná een geslaagde verzending vastleggen, zodat een mislukte poging
        // morgen opnieuw geprobeerd wordt.
        await admin.from('sales_appointment_reminders').insert({ appointment_id: a.id, days_before: daysBefore })
        out.sent++
      } else {
        out.errors.push(`${client.name}: ${res.error ?? 'versturen mislukt'}`)
      }
    }
  }

  return out
}
