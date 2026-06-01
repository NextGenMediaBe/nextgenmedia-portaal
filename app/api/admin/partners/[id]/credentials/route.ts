import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// PATCH — admin updates a partner's login email and/or password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id: partnerId } = await params
    const { email, password } = await req.json()

    if (!email && !password) {
      return NextResponse.json({ error: 'Geef een e-mail of wachtwoord op' }, { status: 400 })
    }
    if (password && String(password).length < 8) {
      return NextResponse.json({ error: 'Wachtwoord moet minstens 8 tekens zijn' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    const { data: partner } = await admin
      .from('freelancers')
      .select('user_id')
      .eq('id', partnerId)
      .maybeSingle()
    if (!partner?.user_id) {
      return NextResponse.json({ error: 'Geen gekoppeld login-account voor deze partner' }, { status: 404 })
    }

    const authPatch: { email?: string; password?: string } = {}
    if (email) authPatch.email = String(email).trim()
    if (password) authPatch.password = String(password)

    const { error: authErr } = await admin.auth.admin.updateUserById(partner.user_id, {
      ...authPatch,
      email_confirm: true,
    })
    if (authErr) throw new Error(authErr.message)

    const rowPatch: Record<string, unknown> = {}
    if (email) rowPatch.email = String(email).trim()
    if (password) rowPatch.login_password = String(password)
    if (Object.keys(rowPatch).length > 0) {
      let { error } = await admin.from('freelancers').update(rowPatch).eq('id', partnerId)
      if (error && /login_password/i.test(error.message ?? '')) {
        delete rowPatch.login_password
        if (Object.keys(rowPatch).length > 0) {
          ({ error } = await admin.from('freelancers').update(rowPatch).eq('id', partnerId))
        } else { error = null }
      }
      if (error) throw new Error(error.message)
    }

    try { revalidatePath(`/admin/partners/${partnerId}`) } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
