import Link from 'next/link'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import { ListChecks, AlertTriangle, CalendarClock, CheckCircle2 } from 'lucide-react'

type Task = { id: string; client_id: string; title: string; deadline: string | null; status: string; completed_at: string | null }

export async function ClientTasksWidget() {
  let tasks: Task[] = []
  let nameById = new Map<string, string>()
  try {
    const admin = createAdminSupabaseClient()
    const { data } = await admin.from('client_tasks').select('id, client_id, title, deadline, status, completed_at').order('deadline', { ascending: true }).limit(300)
    tasks = (data ?? []) as Task[]
    const ids = [...new Set(tasks.map((t) => t.client_id))]
    if (ids.length) {
      const { data: clients } = await admin.from('clients').select('id, company_name').in('id', ids)
      nameById = new Map((clients ?? []).map((c) => [c.id, c.company_name]))
    }
  } catch {
    return null // tabel ontbreekt nog → blok niet tonen
  }

  const todayStr = new Date().toISOString().slice(0, 10)
  const weekStr = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10)
  const weekAgo = new Date(Date.now() - 7 * 86400e3).toISOString()
  const openish = (t: Task) => t.status === 'open' || t.status === 'in_progress'

  const overdue = tasks.filter((t) => openish(t) && t.deadline && t.deadline < todayStr)
  const soon = tasks.filter((t) => openish(t) && t.deadline && t.deadline >= todayStr && t.deadline <= weekStr)
  const doneRecent = tasks.filter((t) => t.status === 'done' && t.completed_at && t.completed_at >= weekAgo)

  if (overdue.length === 0 && soon.length === 0 && doneRecent.length === 0) return null
  const nm = (id: string) => nameById.get(id) ?? 'Klant'

  const Col = ({ title, Icon, color, list, showDeadline = true }: { title: string; Icon: React.ElementType; color: string; list: Task[]; showDeadline?: boolean }) => (
    <div>
      <div className={`flex items-center gap-1.5 text-xs font-medium mb-2 ${color}`}><Icon className="h-3.5 w-3.5" />{title}<span className="text-gray-400">({list.length})</span></div>
      {list.length === 0 ? <p className="text-xs text-gray-300">Geen</p> : (
        <div className="space-y-1">
          {list.slice(0, 6).map((t) => (
            <Link key={t.id} href={`/admin/clients/${t.client_id}`} className="block rounded-lg px-2 py-1.5 hover:bg-gray-50">
              <div className="text-sm font-medium truncate">{t.title}</div>
              <div className="text-[11px] text-gray-400">{nm(t.client_id)}{showDeadline && t.deadline ? ` · ${formatDate(t.deadline)}` : ''}{!showDeadline && t.completed_at ? ` · ${formatDate(t.completed_at)}` : ''}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="card-base">
      <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-2 mb-3"><ListChecks className="h-4 w-4 text-gray-400" />Open klanttaken</h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Col title="Achterstallig" Icon={AlertTriangle} color="text-red-600" list={overdue} />
        <Col title="Deadline binnenkort" Icon={CalendarClock} color="text-amber-600" list={soon} />
        <Col title="Door klant voltooid" Icon={CheckCircle2} color="text-green-600" list={doneRecent} showDeadline={false} />
      </div>
    </div>
  )
}
