import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  const role = roleData?.role
  if (role === 'admin') redirect('/admin')
  if (role === 'client') redirect('/portal')
  if (role === 'freelancer') redirect('/partner')

  redirect('/login')
}
