import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminSidebar } from '@/components/admin/sidebar'
import { AdminTopBar } from '@/components/admin/admin-topbar'
import { AiAssistant } from '@/components/admin/ai-assistant'
import { Toaster } from 'sonner'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (roleData?.role !== 'admin') redirect('/login')

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      <AdminSidebar />
      <main className="flex-1 min-w-0 md:ml-[var(--sidebar-width)] min-h-screen">
        <div className="max-w-[1400px] mx-auto px-4 pt-16 pb-8 md:pt-6 md:px-6 lg:px-8">
          <AdminTopBar />
          {children}
        </div>
      </main>
      <AiAssistant />
    </div>
  )
}
