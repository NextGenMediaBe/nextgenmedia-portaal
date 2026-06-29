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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdminUser())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const b = await req.json()
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof b.title === 'string') patch.title = b.title.trim()
    if (b.content !== undefined) patch.content = b.content || null
    if (Array.isArray(b.audiences)) patch.audiences = b.audiences.filter((a: unknown): a is string => typeof a === 'string' && AUDIENCES.includes(a))
    if (typeof b.active === 'boolean') patch.active = b.active
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('terms').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/voorwaarden') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdminUser())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('terms').delete().eq('id', id)
    if (error) throw new Error(error.message)
    try { revalidatePath('/admin/voorwaarden') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
