import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail, getAdminEmails, baseUrl } from '@/lib/email'

export const dynamic = 'force-dynamic'

// Automatische INTERNE melding naar admins. Nooit naar klanten.
// Beveiligd met CRON_SECRET (Vercel Cron stuurt Authorization: Bearer <secret>).
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const header = req.headers.get('authorization')
  if (header === `Bearer ${secret}`) return true
  return req.nextUrl.searchParams.get('key') === secret
}

async function safeList<T>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try { const { data } = await p; return data ?? [] } catch { return [] }
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })

  const admin = createAdminSupabaseClient()

  // Laatste meldingstijdstip ophalen (singleton-rij), of nu initialiseren.
  let lastRun = new Date(Date.now() - 3600_000).toISOString()
  try {
    const { data } = await admin.from('admin_notify_state').select('last_run_at').eq('id', 'singleton').maybeSingle()
    if (data?.last_run_at) lastRun = data.last_run_at
    else await admin.from('admin_notify_state').insert({ id: 'singleton', last_run_at: lastRun })
  } catch { /* tabel ontbreekt → degradeer */ }

  // Wijzigingen sinds lastRun verzamelen.
  const approvals = await safeList(admin.from('social_content_items').select('client_id, title').eq('status', 'approved').gt('updated_at', lastRun))
  const feedback = await safeList(admin.from('social_content_items').select('client_id, title').eq('status', 'changes_requested').gt('updated_at', lastRun))
  const webRequests = await safeList(admin.from('webdesign_change_requests').select('client_id, title, kind').gt('created_at', lastRun))

  const total = approvals.length + feedback.length + webRequests.length
  if (total === 0) {
    return NextResponse.json({ ok: true, changes: 0, sent: false })
  }

  // Klantnamen ophalen.
  const ids = new Set<string>()
  for (const r of [...approvals, ...feedback, ...webRequests] as { client_id: string | null }[]) if (r.client_id) ids.add(r.client_id)
  const nameById = new Map<string, string>()
  if (ids.size > 0) {
    const { data: clients } = await admin.from('clients').select('id, company_name').in('id', [...ids])
    for (const c of clients ?? []) nameById.set(c.id, c.company_name)
  }
  const nm = (id: string | null) => (id ? nameById.get(id) ?? 'Klant' : 'Klant')

  const lines: string[] = []
  for (const a of approvals as { client_id: string | null; title: string | null }[]) lines.push(`✓ ${nm(a.client_id)} keurde "${a.title ?? 'een script'}" goed`)
  for (const f of feedback as { client_id: string | null; title: string | null }[]) lines.push(`✓ ${nm(f.client_id)} gaf feedback op "${f.title ?? 'een item'}"`)
  for (const w of webRequests as { client_id: string | null; title: string | null; kind: string | null }[]) {
    const wat = w.kind === 'maintenance' ? 'diende een onderhoudsaanvraag in' : 'diende een websiteaanpassing in'
    lines.push(`✓ ${nm(w.client_id)} ${wat}${w.title ? ` (${w.title})` : ''}`)
  }

  const subject = 'Nieuwe activiteiten in NextGenMedia'
  const text = `Volgende zaken vragen aandacht:\n\n${lines.join('\n')}\n\nOpen het dashboard om dit te bekijken:\n${baseUrl()}/admin`

  const recipients = await getAdminEmails()
  const result = await sendEmail({ to: recipients, subject, text })

  // Log de melding.
  try {
    await admin.from('email_messages').insert({
      to_email: recipients.join(', '), subject, body: text, kind: 'admin_notify', audience: 'admin',
      status: result.ok ? 'sent' : 'error', error: result.ok ? null : result.error, provider_id: result.id || null,
    })
  } catch { /* log faalt stil */ }

  // Vensters enkel verschuiven als de mail vertrok (anders volgende keer opnieuw).
  if (result.ok) {
    try { await admin.from('admin_notify_state').update({ last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', 'singleton') } catch { }
  }

  return NextResponse.json({ ok: result.ok, changes: total, sent: result.ok, error: result.ok ? undefined : result.error })
}
