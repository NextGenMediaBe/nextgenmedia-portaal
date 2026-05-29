import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PartnerSidebar } from '@/components/partner/sidebar'

export default async function PartnerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (roleData?.role !== 'freelancer') redirect('/login')

  const { data: partner } = await supabase
    .from('freelancers').select('name').eq('user_id', user.id).maybeSingle()

  return (
    <div className="min-h-screen bg-gray-50">
      <PartnerSidebar partnerName={partner?.name ?? 'Partner'} />
      <main
        className="transition-all duration-200"
        style={{ marginLeft: 'var(--sidebar-width)', padding: '2rem' }}
      >
        {children}
      </main>
    </div>
  )
}
