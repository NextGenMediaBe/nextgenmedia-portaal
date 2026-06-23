export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { BlogCalendar, type CalEvent } from './blog-calendar'

export default async function BlogCalendarPage() {
  const admin = createAdminSupabaseClient()
  const [{ data: blogs }, { data: accounts }] = await Promise.all([
    admin.from('blogs').select('id, titel, status, account_id, gegenereerd_op, gepubliceerd_op, publish_at').limit(1000),
    admin.from('blog_accounts').select('id, name, volgende_generatie_datum, active'),
  ])
  const nameById = new Map((accounts ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))
  const day = (v: string | null) => (v ? v.slice(0, 10) : null)

  const events: CalEvent[] = []
  for (const b of (blogs ?? []) as { id: string; titel: string; status: string; account_id: string | null; gegenereerd_op: string | null; gepubliceerd_op: string | null; publish_at: string | null }[]) {
    const acc = b.account_id ? (nameById.get(b.account_id) ?? '—') : '—'
    if (b.status === 'klaar_voor_review' && b.gegenereerd_op) events.push({ date: day(b.gegenereerd_op)!, kind: 'review', titel: b.titel, account: acc })
    if (b.gepubliceerd_op) events.push({ date: day(b.gepubliceerd_op)!, kind: 'published', titel: b.titel, account: acc })
    if (b.status === 'goedgekeurd' && b.publish_at) events.push({ date: day(b.publish_at)!, kind: 'scheduled', titel: b.titel, account: acc })
  }
  for (const a of (accounts ?? []) as { id: string; name: string; volgende_generatie_datum: string | null; active: boolean }[]) {
    if (a.active && a.volgende_generatie_datum) events.push({ date: day(a.volgende_generatie_datum)!, kind: 'generation', titel: `Generatie: ${a.name}`, account: a.name })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Blog Kalender</h1>
        <p className="text-sm text-gray-500 mt-0.5">Wat wordt gegenereerd, wacht op review, gepland staat of gepubliceerd is — per maand, week of lijst.</p>
      </div>
      <BlogCalendar events={events} />
    </div>
  )
}
