import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalSidebar } from '@/components/portal/sidebar'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (roleData?.role !== 'client') redirect('/login')

  const { data: client } = await supabase
    .from('clients').select('id, company_name').eq('owner_user_id', user.id).maybeSingle()

  // Fetch active services — separate query to avoid FK join failures
  let activeServices: string[] = []
  if (client?.id) {
    const { data: svcRows } = await supabase
      .from('client_services')
      .select('service_slug, active')
      .eq('client_id', client.id)
    activeServices = (svcRows ?? [])
      .filter((s: { active: boolean }) => s.active)
      .map((s: { service_slug: string }) => s.service_slug)
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <PortalSidebar
        companyName={client?.company_name ?? 'Klantenportaal'}
        activeServices={activeServices}
      />
      <main className="flex-1 min-w-0 md:ml-[var(--sidebar-width)] min-h-screen">
        <div className="max-w-[1200px] mx-auto px-4 pt-16 pb-8 md:pt-6 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
