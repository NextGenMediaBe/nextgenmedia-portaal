// Server-side mailverzending via Resend (REST, geen extra dependency).
// Vereist env: RESEND_API_KEY. Afzender vast op info@nextgenmedia.be (override
// via EMAIL_FROM). Zonder API-key faalt verzenden netjes met een duidelijke fout.

import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

export const EMAIL_FROM = process.env.EMAIL_FROM || 'NextGenMedia <info@nextgenmedia.be>'

/** Publieke basis-URL van de app, voor links in mails. */
export function baseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL
  if (explicit) return explicit.replace(/\/$/, '')
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
  return 'http://localhost:3000'
}

export type SendResult = { ok: boolean; id?: string; error?: string }

/** Verstuurt één mail. Geef `html` mee voor opgemaakte mails; anders wordt de
 *  tekst als simpele HTML verzonden. */
export async function sendEmail(opts: {
  to: string | string[]; subject: string; text: string; html?: string
  /** Antwoorden komen hier terecht i.p.v. bij de afzender. Gebruikt bij mails
   *  die wij namens iemand anders sturen (bv. afspraakherinneringen). */
  replyTo?: string | null
  /** Afzender overschrijven — nodig omdat wij voor twee bedrijven mailen.
   *  Het domein moet wél geverifieerd zijn bij Resend, anders weigert die. */
  from?: string | null
  /** Bijlagen. `path` is een publiek bereikbare URL; Resend haalt het bestand
   *  zelf op, zodat wij geen megabytes door een serverless functie duwen. */
  attachments?: { filename: string; path: string }[]
  /** ISO-tijdstip waarop de mail moet vertrekken. Resend houdt hem tot dan vast
   *  — maximaal 72 uur vooruit. Zo halen we een verzendmoment op de minuut
   *  zonder dat er elk kwartier een cron moet draaien. */
  scheduledAt?: string | null
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'Geen mailprovider geconfigureerd (RESEND_API_KEY ontbreekt).' }

  const html = opts.html ?? `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111;white-space:pre-wrap">${escapeHtml(opts.text)}</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: opts.from || EMAIL_FROM,
        to: Array.isArray(opts.to) ? opts.to : [opts.to],
        subject: opts.subject,
        text: opts.text,
        html,
        ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
        ...(opts.attachments?.length ? { attachments: opts.attachments } : {}),
        ...(opts.scheduledAt ? { scheduled_at: opts.scheduledAt } : {}),
      }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.message || `Resend-fout (${res.status})` }
    return { ok: true, id: json?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verzenden mislukt' }
  }
}

/** Uiterste horizon van Resend voor een ingeplande mail. */
export const SCHEDULE_HORIZON_MS = 72 * 3600 * 1000

/**
 * Een ingeplande mail alsnog tegenhouden — bijvoorbeeld wanneer de afspraak
 * geannuleerd of verplaatst wordt. Faalt dit, dan melden we dat: een
 * herinnering voor een afgezegde afspraak is erger dan geen herinnering.
 */
export async function cancelScheduledEmail(id: string): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'Geen mailprovider geconfigureerd.' }
  if (!id) return { ok: false, error: 'Geen mail-id' }
  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) {
      const json = await res.json().catch(() => ({}))
      return { ok: false, error: json?.message || `Resend-fout (${res.status})` }
    }
    return { ok: true, id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Annuleren mislukt' }
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** E-mailadressen van alle admins (voor automatische interne meldingen). */
export async function getAdminEmails(): Promise<string[]> {
  const admin = createAdminSupabaseClient()
  const out = new Set<string>()
  try {
    const { data: roles } = await admin.from('user_roles').select('user_id').eq('role', 'admin')
    const ids = new Set((roles ?? []).map((r: { user_id: string }) => r.user_id))
    if (ids.size > 0) {
      // listUsers is gepagineerd; founders zijn een handvol, één pagina volstaat.
      const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
      for (const u of data?.users ?? []) {
        if (ids.has(u.id) && u.email) out.add(u.email)
      }
    }
  } catch { /* val terug op bedrijfsinbox */ }
  // Bedrijfsinbox altijd meenemen zodat meldingen nooit verloren gaan.
  out.add('info@nextgenmedia.be')
  return [...out]
}

/** Wat Resend over één mail weet. `lastEvent` is de echte status. */
export type EmailStatus = {
  id: string
  lastEvent: string | null      // scheduled | queued | sent | delivered | bounced | complained | canceled | ...
  to: string[]
  subject: string | null
  createdAt: string | null
  scheduledAt: string | null
}

/**
 * Status van één verzonden of ingeplande mail opvragen bij Resend.
 * Dit is de enige betrouwbare bron: onze eigen tabel weet alleen dát we hem
 * hebben aangeboden, niet of hij ook aangekomen is.
 */
export async function getEmailStatus(id: string): Promise<EmailStatus | null> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey || !id) return null
  try {
    const res = await fetch(`https://api.resend.com/emails/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const j = await res.json() as {
      id?: string; last_event?: string; to?: string[] | string
      subject?: string; created_at?: string; scheduled_at?: string
    }
    return {
      id: j.id ?? id,
      lastEvent: j.last_event ?? null,
      to: Array.isArray(j.to) ? j.to : j.to ? [j.to] : [],
      subject: j.subject ?? null,
      createdAt: j.created_at ?? null,
      scheduledAt: j.scheduled_at ?? null,
    }
  } catch { return null }
}
