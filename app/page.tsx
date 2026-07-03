import { redirect } from 'next/navigation'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Rol via service-role (bypasst de restrictive user_roles-RLS die niet-admins
  // hun eigen rol laat lezen → anders login-loop voor werknemers/klanten).
  const admin = createAdminSupabaseClient()
  const { data: roleData } = await admin
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = roleData?.role
  // Werknemers (rol 'employee') horen — net als admins — in het admin-portaal.
  // Zonder deze case viel een werknemer door naar /login → login stuurt terug
  // naar '/' → oneindige refresh-loop (nooit ingelogd geraken).
  if (role === 'admin' || role === 'employee') redirect('/admin')
  if (role === 'client') redirect('/portal')
  if (role === 'freelancer') redirect('/partner')

  redirect('/login')
}
