export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { Bell, Clock } from 'lucide-react'

export default async function NotificationsPage() {
  let lastRun: string | null = null
  let rows: Array<{ id: string; created_at: string; subject: string; body: string; status: string }> = []
  try {
    const admin = createAdminSupabaseClient()
    const [{ data: state }, { data: msgs }] = await Promise.all([
      admin.from('admin_notify_state').select('last_run_at').eq('id', 'singleton').maybeSingle(),
      admin.from('email_messages').select('id, created_at, subject, body, status').eq('audience', 'admin').order('created_at', { ascending: false }).limit(50),
    ])
    lastRun = state?.last_run_at ?? null
    rows = (msgs ?? []) as typeof rows
  } catch { /* tabel ontbreekt */ }

  return (
    <div className="space-y-4">
      <div className="card-base">
        <h2 className="font-semibold text-sm flex items-center gap-2"><Bell className="h-4 w-4 text-gray-400" />Automatische admin-meldingen</h2>
        <p className="text-sm text-gray-500 mt-1">
          Elk uur controleert het systeem op nieuwe scriptgoedkeuringen, scriptfeedback, websiteaanvragen en onderhoudsaanvragen.
          Zijn er wijzigingen, dan krijgen de admins één samenvattende mail. Zijn er geen wijzigingen, dan wordt er niets verstuurd.
          <span className="block mt-1 text-gray-400">Deze meldingen gaan uitsluitend naar admins — nooit naar klanten.</span>
        </p>
        <div className="mt-3 inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
          <Clock className="h-3.5 w-3.5" />Laatste controle: {lastRun ? formatDate(lastRun) : 'nog niet uitgevoerd'}
        </div>
      </div>

      <div className="card-base">
        <h3 className="font-semibold text-sm mb-3">Recente meldingen</h3>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">Nog geen meldingen verstuurd.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((m) => (
              <div key={m.id} className="rounded-lg border border-gray-100 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{m.subject}</span>
                  <span className="text-xs text-gray-400">{formatDate(m.created_at)}</span>
                </div>
                <p className="text-xs text-gray-500 whitespace-pre-wrap mt-1 line-clamp-4">{m.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
