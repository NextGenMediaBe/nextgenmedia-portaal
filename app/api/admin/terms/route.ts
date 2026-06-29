import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const AUDIENCES = ['admin', 'client', 'partner']

async function requireAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

const cleanAudiences = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string' && AUDIENCES.includes(a)) : []

// GET — alle voorwaarden (admin-beheer).
export async function GET() {
  try {
    if (!(await requireAdminUser())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data } = await admin.from('terms').select('*').order('created_at', { ascending: false })
    return NextResponse.json({ terms: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST — nieuwe voorwaarde.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const title = (b.title as string)?.trim()
    if (!title) return NextResponse.json({ error: 'Titel is verplicht' }, { status: 400 })
    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('terms').insert({
      title, content: (b.content as string) || null, audiences: cleanAudiences(b.audiences),
      active: b.active !== false, created_by: user.id,
    }).select('id').single()
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/voorwaarden') } catch { }
    return NextResponse.json({ id: data.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
