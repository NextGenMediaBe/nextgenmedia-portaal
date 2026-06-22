export const dynamic = 'force-dynamic'

import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { BlogReview, type ReviewBlog } from './blog-review'

export default async function BlogsPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client } = await searchParams
  const admin = createAdminSupabaseClient()
  const [{ data: blogs }, { data: clients }] = await Promise.all([
    admin.from('blogs').select('*').order('gegenereerd_op', { ascending: false }).limit(500),
    admin.from('clients').select('id, company_name').order('company_name'),
  ])
  const nameById = new Map((clients ?? []).map((c: { id: string; company_name: string }) => [c.id, c.company_name]))
  const list: ReviewBlog[] = ((blogs ?? []) as ReviewBlog[]).map((b) => ({ ...b, client_name: nameById.get(b.client_id) ?? '—' }))

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Blogs — review</h1>
        <p className="text-sm text-gray-500 mt-0.5">Bekijk, bewerk en keur gegenereerde blogs goed. Publicatie naar Framer gebeurt pas na goedkeuring.</p>
      </div>
      <BlogReview initialBlogs={list} clients={(clients ?? []) as { id: string; company_name: string }[]} initialClient={client ?? ''} />
    </div>
  )
}
