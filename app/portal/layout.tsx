import { redirect } from 'next/navigation'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { PortalSidebar } from '@/components/portal/sidebar'
import { resolvePortalSession, sessionCan, touchLastLogin } from '@/lib/portal-auth'
import { PORTAL_MODULES } from '@/lib/portal-permissions'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  // Resolveert owner óf subaccount → clientId + rechten + actief.
  const session = await resolvePortalSession()
  if (!session) redirect('/login')
  if (!session.active) redirect('/login')

  // Best-effort laatste-login registreren (subaccounts).
  await touchLastLogin(session)

  const admin = createAdminSupabaseClient()
  const { data: client } = await admin
    .from('clients').select('id, company_name').eq('id', session.clientId).maybeSingle()

  // Actieve diensten + blogs (gating naast rechten).
  let activeServices: string[] = []
  let hasBlogs = false
  const { data: svcRows } = await admin
    .from('client_services').select('service_slug, active').eq('client_id', session.clientId)
  activeServices = (svcRows ?? []).filter((s: { active: boolean }) => s.active).map((s: { service_slug: string }) => s.service_slug)
  const { count: blogAccCount } = await admin
    .from('blog_accounts').select('id', { count: 'exact', head: true }).eq('client_id', session.clientId)
  hasBlogs = (blogAccCount ?? 0) > 0

  // Modules waarvoor deze gebruiker view-recht heeft (owner = alles).
  const allowedModules = PORTAL_MODULES.filter((m) => sessionCan(session, m, 'view'))

  return (
    <div className="flex min-h-screen bg-gray-50">
      <PortalSidebar
        companyName={client?.company_name ?? 'Klantenportaal'}
        activeServices={activeServices}
        hasBlogs={hasBlogs}
        allowedModules={allowedModules}
      />
      <main className="flex-1 min-w-0 md:ml-[var(--sidebar-width)] min-h-screen">
        <div className="max-w-[1200px] mx-auto px-4 pt-20 pb-8 md:pt-6 md:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  )
}
