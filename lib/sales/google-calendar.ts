import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { encryptSecret, decryptSecret } from '@/lib/crypto'
import { baseUrl } from '@/lib/email'
import type { Interval } from '@/lib/sales/availability'

// Google Calendar per klant (§7). Bewust provider-agnostisch opgezet: de
// koppeltabel heeft een `provider`-kolom, zodat ClickUp later als tweede
// provider bijgebouwd kan worden zonder dit datamodel te wijzigen.
//
// Tokens worden VERSLEUTELD opgeslagen (lib/crypto.ts) en verlaten nooit de
// server. Vereist env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET.

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API = 'https://www.googleapis.com/calendar/v3'

// Lezen én schrijven van agenda's; 'email' om te tonen welk account gekoppeld is.
const SCOPES = ['https://www.googleapis.com/auth/calendar', 'openid', 'email']

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

export function redirectUri(): string {
  return `${baseUrl()}/api/admin/sales/calendar/callback`
}

/** Stap 1 van OAuth: waar sturen we de gebruiker heen. */
export function authUrl(salesClientId: string, state: string, name: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline',       // nodig voor een refresh token
    prompt: 'consent',            // dwingt een refresh token af, ook bij herkoppelen
    // De naam van de agenda reist mee, zodat de callback weet van wie hij is.
    state: `${salesClientId}:${state}:${encodeURIComponent(name)}`,
  })
  return `${AUTH_URL}?${p.toString()}`
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; error_description?: string; id_token?: string }

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as TokenResponse
  if (!res.ok) throw new Error(json.error_description ?? `Google gaf een fout (${res.status})`)
  return json
}

/** Stap 2: code omruilen voor tokens en de koppeling opslaan. */
export async function exchangeCode(salesClientId: string, code: string, name: string): Promise<void> {
  const tok = await tokenRequest({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirect_uri: redirectUri(),
    grant_type: 'authorization_code',
  })
  if (!tok.access_token) throw new Error('Google gaf geen toegangstoken terug')

  // E-mailadres van het gekoppelde account tonen we in de UI ("gekoppeld als …").
  let email: string | null = null
  try {
    const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { Authorization: `Bearer ${tok.access_token}` },
    })
    const info = await r.json() as { email?: string }
    email = info.email ?? null
  } catch { /* niet kritiek */ }

  const admin = createAdminSupabaseClient()
  // Eén agenda per Google-account binnen dezelfde klant. Koppel je hetzelfde
  // account opnieuw, dan verversen we de tokens i.p.v. een tweede rij te maken.
  // Zonder e-mailadres valt 'primary' terug op één rij per klant.
  const calendarId = email ?? 'primary'
  await admin.from('sales_calendar_connections').upsert({
    sales_client_id: salesClientId,
    provider: 'google',
    name: name || email || 'Agenda',
    account_email: email,
    calendar_id: calendarId,
    active: true,
    access_token: encryptSecret(tok.access_token),
    refresh_token: tok.refresh_token ? encryptSecret(tok.refresh_token) : null,
    token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    status: 'connected',
  }, { onConflict: 'sales_client_id,provider,calendar_id' })
}

type Connection = {
  id: string; calendar_id: string | null
  access_token: string | null; refresh_token: string | null; token_expires_at: string | null
}

/**
 * Geldig toegangstoken ophalen; vernieuwt automatisch als het verlopen is.
 * `connectionId` = de agenda (persoon). Alle aanroepen werken nu per agenda,
 * zodat Bram en Marco elk hun eigen tokens en agenda houden.
 */
async function accessToken(connectionId: string): Promise<{ token: string; calendarId: string } | null> {
  const admin = createAdminSupabaseClient()
  const { data } = await admin
    .from('sales_calendar_connections')
    .select('id, calendar_id, account_email, access_token, refresh_token, token_expires_at')
    .eq('id', connectionId).maybeSingle()
  const conn = data as (Connection & { account_email?: string | null }) | null
  if (!conn?.access_token) return null

  const calendarId = conn.calendar_id || 'primary'
  const expires = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  // Een minuut marge, zodat een net-nog-geldig token niet halverwege verloopt.
  if (expires - 60000 > Date.now()) {
    return { token: decryptSecret(conn.access_token), calendarId }
  }

  const refresh = conn.refresh_token ? decryptSecret(conn.refresh_token) : ''
  if (!refresh) {
    await admin.from('sales_calendar_connections').update({ status: 'expired' }).eq('id', conn.id)
    return null
  }
  const tok = await tokenRequest({
    refresh_token: refresh,
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    grant_type: 'refresh_token',
  })
  if (!tok.access_token) return null
  await admin.from('sales_calendar_connections').update({
    access_token: encryptSecret(tok.access_token),
    token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    status: 'connected',
  }).eq('id', conn.id)
  return { token: tok.access_token, calendarId }
}

/** Bezette momenten uit de agenda van de klant — voedt het grijs (§7). */
export async function fetchBusy(connectionId: string, from: number, to: number): Promise<Interval[]> {
  const auth = await accessToken(connectionId)
  if (!auth) return []
  try {
    const res = await fetch(`${API}/freeBusy`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timeMin: new Date(from).toISOString(),
        timeMax: new Date(to).toISOString(),
        items: [{ id: auth.calendarId }],
      }),
    })
    if (!res.ok) return []
    const json = await res.json() as { calendars?: Record<string, { busy?: { start: string; end: string }[] }> }
    const busy = json.calendars?.[auth.calendarId]?.busy ?? []
    return busy.map((b) => ({ start: new Date(b.start).getTime(), end: new Date(b.end).getTime() }))
  } catch {
    // Agenda onbereikbaar → geen bezet-informatie. We tonen dan enkel onze eigen
    // afspraken als bezet; de DB-constraint voorkomt hoe dan ook dubbele boeking.
    return []
  }
}

export type CreatedEvent = { eventId: string; meetUrl: string | null }

/** Event aanmaken in de agenda van de klant, optioneel met Google Meet (§7). */
export async function createEvent(connectionId: string, opts: {
  summary: string
  description?: string
  startsAt: number
  endsAt: number
  timezone: string
  attendeeEmail?: string | null
  withMeet?: boolean
}): Promise<CreatedEvent> {
  const auth = await accessToken(connectionId)
  if (!auth) throw new Error('Deze agenda is niet (meer) gekoppeld')

  const body: Record<string, unknown> = {
    summary: opts.summary,
    description: opts.description ?? '',
    start: { dateTime: new Date(opts.startsAt).toISOString(), timeZone: opts.timezone },
    end: { dateTime: new Date(opts.endsAt).toISOString(), timeZone: opts.timezone },
  }
  if (opts.attendeeEmail) body.attendees = [{ email: opts.attendeeEmail }]
  if (opts.withMeet) {
    body.conferenceData = { createRequest: { requestId: `ngm-${Date.now()}`, conferenceSolutionKey: { type: 'hangoutsMeet' } } }
  }

  const params = new URLSearchParams({ conferenceDataVersion: opts.withMeet ? '1' : '0', sendUpdates: opts.attendeeEmail ? 'all' : 'none' })
  const res = await fetch(`${API}/calendars/${encodeURIComponent(auth.calendarId)}/events?${params}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({})) as { id?: string; hangoutLink?: string; error?: { message?: string } }
  if (!res.ok || !json.id) throw new Error(json.error?.message ?? 'Google kon de afspraak niet aanmaken')
  return { eventId: json.id, meetUrl: json.hangoutLink ?? null }
}

/** Verplaatsen — houdt het Google-event gelijk aan onze afspraak. */
export async function moveEvent(connectionId: string, eventId: string, startsAt: number, endsAt: number, timezone: string): Promise<void> {
  const auth = await accessToken(connectionId)
  if (!auth) throw new Error('Deze agenda is niet (meer) gekoppeld')
  const res = await fetch(`${API}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      start: { dateTime: new Date(startsAt).toISOString(), timeZone: timezone },
      end: { dateTime: new Date(endsAt).toISOString(), timeZone: timezone },
    }),
  })
  if (!res.ok) {
    const j = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(j.error?.message ?? 'Google kon de afspraak niet verplaatsen')
  }
}

/** Annuleren — geen wees-events laten staan (§7). */
export async function deleteEvent(connectionId: string, eventId: string): Promise<void> {
  const auth = await accessToken(connectionId)
  if (!auth) return
  // 404/410 = al weg; dat is geen fout voor ons.
  await fetch(`${API}/calendars/${encodeURIComponent(auth.calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${auth.token}` },
  }).catch(() => {})
}
