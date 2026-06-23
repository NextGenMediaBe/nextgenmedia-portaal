export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { BlogReview, type ReviewBlog } from './blog-review'

export default async function BlogsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const { account } = await searchParams
  const admin = createAdminSupabaseClient()
  const [{ data: blogs }, { data: accounts }] = await Promise.all([
    admin.from('blogs').select('*').order('gegenereerd_op', { ascending: false }).limit(500),
    admin.from('blog_accounts').select('id, name').order('name'),
  ])
  const nameById = new Map((accounts ?? []).map((a: { id: string; name: string }) => [a.id, a.name]))
  const list: ReviewBlog[] = ((blogs ?? []) as ReviewBlog[]).map((b) => ({ ...b, account_name: b.account_id ? (nameById.get(b.account_id) ?? '—') : '—' }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Blogs — review</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bekijk, bewerk en keur gegenereerde blogs goed. Publicatie naar Framer gebeurt pas na goedkeuring.</p>
      </div>
      <BlogReview initialBlogs={list} accounts={(accounts ?? []) as { id: string; name: string }[]} initialAccount={account ?? ''} />
    </div>
  )
}
