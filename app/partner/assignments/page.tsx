export const dynamic = 'force-dynamic'

import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerAssignmentsClient } from './assignments-client'

export default async function PartnerAssignmentsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: partner } = await supabase
    .from('freelancers').select('id').eq('user_id', user.id).maybeSingle()
  if (!partner) redirect('/login')

  // Separate queries — avoids PostgREST FK join failures
  const { data: assignments } = await supabase
    .from('freelancer_assignments')
    .select('id, title, description, status, budget, payout, deadline, created_at, service_slug, client_id')
    .eq('freelancer_id', partner.id)
    .order('created_at', { ascending: false })

  // Fetch client names via admin client (bypasses RLS — partners shouldn't have direct client access)
  const clientIds = Array.from(new Set((assignments ?? []).map((a) => a.client_id).filter((v): v is string => !!v)))
  let clientMap = new Map<string, string>()
  if (clientIds.length > 0) {
    const admin = createAdminSupabaseClient()
    const { data: clients } = await admin
      .from('clients')
      .select('id, company_name')
      .in('id', clientIds)
    clientMap = new Map((clients ?? []).map((c) => [c.id, c.company_name]))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Opdrachten</h1>
        <p className="text-sm text-gray-500 mt-0.5">Uw toegewezen opdrachten van NextGenMedia</p>
      </div>
      <PartnerAssignmentsClient
        partnerId={partner.id}
        initialAssignments={(assignments ?? []).map((a) => ({
          id: a.id,
          title: a.title,
          description: a.description,
          status: a.status,
          budget: a.budget,
          payout: a.payout,
          deadline: a.deadline,
          created_at: a.created_at,
          service_slug: a.service_slug,
          client_name: a.client_id ? (clientMap.get(a.client_id) ?? null) : null,
        }))}
      />
    </div>
  )
}
