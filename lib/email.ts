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
export async function sendEmail(opts: { to: string | string[]; subject: string; text: string; html?: string }): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'Geen mailprovider geconfigureerd (RESEND_API_KEY ontbreekt).' }

  const html = opts.html ?? `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.6;color:#111;white-space:pre-wrap">${escapeHtml(opts.text)}</div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: Array.isArray(opts.to) ? opts.to : [opts.to], subject: opts.subject, text: opts.text, html }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: json?.message || `Resend-fout (${res.status})` }
    return { ok: true, id: json?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Verzenden mislukt' }
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
