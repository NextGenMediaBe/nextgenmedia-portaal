export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { formatDate, formatEuro } from '@/lib/utils'
import { AssignmentsClient } from './assignments-client'

const ROLE_LABELS: Record<string, string> = {
  photographer: 'Fotograaf', videographer: 'Videograaf', editor: 'Editor',
  designer: 'Designer', copywriter: 'Copywriter', developer: 'Developer',
  strategist: 'Strateeg', other: 'Overig',
}

async function getData() {
  try {
    const admin = createAdminSupabaseClient()
    const [{ data: assignmentRows }, { data: partners }, { data: clientRows }] = await Promise.all([
      admin.from('freelancer_assignments')
        .select('id, title, description, service_slug, roles, status, budget, deadline, client_id, freelancer_id, created_at')
        .order('created_at', { ascending: false }),
      admin.from('freelancers').select('id, name, email, roles').eq('active', true).order('name'),
      admin.from('clients').select('id, company_name').order('company_name'),
    ])

    const freelancerMap = new Map((partners ?? []).map((f) => [f.id, f as { id: string; name: string; email: string }]))
    const clientMap = new Map((clientRows ?? []).map((c) => [c.id, c as { id: string; company_name: string }]))

    const assignments = (assignmentRows ?? []).map((a) => ({
      ...a,
      freelancers: a.freelancer_id ? (freelancerMap.get(a.freelancer_id) ?? null) : null,
      clients: a.client_id ? (clientMap.get(a.client_id) ?? null) : null,
    }))

    return {
      assignments,
      partners: partners ?? [],
      clients: clientRows ?? [],
    }
  } catch {
    return { assignments: [], partners: [], clients: [] }
  }
}

export default async function AssignmentsPage() {
  const { assignments, partners, clients } = await getData()

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Opdrachten</h1>
        <p className="text-sm text-gray-500 mt-0.5">Beheer opdrachten aan partners</p>
      </div>
      <AssignmentsClient
        initialAssignments={assignments as Array<{
          id: string; title: string; description: string | null;
          service_slug: string | null; roles?: string[];
          status: string; budget: number | null; deadline: string | null;
          client_id: string | null; freelancer_id: string | null;
          created_at: string;
          freelancers: { id: string; name: string; email: string } | null;
          clients: { id: string; company_name: string } | null;
        }>}
        partners={partners as Array<{ id: string; name: string; email: string; roles: string[] }>}
        clients={clients as Array<{ id: string; company_name: string }>}
        roleLabels={ROLE_LABELS}
      />
    </div>
  )
}
