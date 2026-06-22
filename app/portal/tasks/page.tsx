export const dynamic = 'force-dynamic'

import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ListChecks } from 'lucide-react'
import { PortalTasks, type PortalTask } from './portal-tasks'

export default async function PortalTasksPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase.from('clients').select('id').eq('owner_user_id', user.id)
  const clientIds = (clients ?? []).map((c: { id: string }) => c.id)

  let tasks: PortalTask[] = []
  if (clientIds.length > 0) {
    const admin = createAdminSupabaseClient()
    const { data } = await admin.from('client_tasks')
      .select('id, title, description, deadline, priority, status, client_note, completed_at, attachment_path, attachment_name')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })
    const rows = (data ?? []) as Array<PortalTask & { attachment_path: string | null }>
    // Veilige, tijdelijke download-URL per bijlage (private bucket, alleen server).
    tasks = await Promise.all(rows.map(async (t) => {
      let attachmentUrl: string | null = null
      if (t.attachment_path) {
        const { data: s } = await admin.storage.from('contracts').createSignedUrl(t.attachment_path, 60 * 60)
        attachmentUrl = s?.signedUrl ?? null
      }
      const { attachment_path: _omit, ...rest } = t
      void _omit
      return { ...rest, attachmentUrl }
    }))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><ListChecks className="h-6 w-6" />Taken</h1>
        <p className="text-sm text-gray-500 mt-0.5">Taken die NextGenMedia voor jou klaarzette.</p>
      </div>
      <PortalTasks initialTasks={tasks} />
    </div>
  )
}
