import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PortalBlogs, type PortalBlog } from './portal-blogs'

export const dynamic = 'force-dynamic'

export default async function PortalBlogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: clients } = await supabase.from('clients').select('id').eq('owner_user_id', user.id)
  const clientIds = (clients ?? []).map((c: { id: string }) => c.id)

  let accounts: { id: string }[] = []
  if (clientIds.length > 0) {
    const { data } = await supabase.from('blog_accounts').select('id').in('client_id', clientIds)
    accounts = data ?? []
  }
  const accountIds = accounts.map((a) => a.id)

  let blogs: PortalBlog[] = []
  if (accountIds.length > 0) {
    const { data } = await supabase
      .from('blogs')
      .select('id, titel, slug, content, meta_title, meta_description, status, gepubliceerd_op, gegenereerd_op, laatst_bewerkt_door, laatst_bewerkt_op')
      .in('account_id', accountIds)
      .order('gegenereerd_op', { ascending: false })
    blogs = (data ?? []) as PortalBlog[]
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-black">Blogs</h1>
        <p className="text-sm text-gray-500 mt-1">Bekijk en bewerk je blogs. Een opgeslagen wijziging aan een gepubliceerde blog wordt automatisch op je website doorgevoerd.</p>
      </div>
      {accountIds.length === 0 ? (
        <div className="card-base text-sm text-gray-500">Er is nog geen blogaccount aan jouw bedrijf gekoppeld.</div>
      ) : (
        <PortalBlogs initialBlogs={blogs} />
      )}
    </div>
  )
}
