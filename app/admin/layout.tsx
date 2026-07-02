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

  const role = roleData?.role
  if (role !== 'admin' && role !== 'employee') redirect('/login')

  // Werknemer = enkel toegestane modules in de sidebar (admin = alles → undefined).
  let allowedModules: string[] | undefined
  if (role === 'employee') {
    const { data: staff } = await supabase
      .from('staff_members')
      .select('active, permissions')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (staff?.active === false) redirect('/login')
    allowedModules = Array.isArray(staff?.permissions) ? (staff!.permissions as string[]) : []
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Toaster richColors position="top-right" />
      <AdminSidebar allowedModules={allowedModules} isEmployee={role === 'employee'} />
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
