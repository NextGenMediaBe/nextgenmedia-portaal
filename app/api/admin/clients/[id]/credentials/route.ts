import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// PATCH — admin updates a client's login email and/or password
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id: clientId } = await params
    const { email, password } = await req.json()

    if (!email && !password) {
      return NextResponse.json({ error: 'Geef een e-mail of wachtwoord op' }, { status: 400 })
    }
    if (password && String(password).length < 8) {
      return NextResponse.json({ error: 'Wachtwoord moet minstens 8 tekens zijn' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()

    // Get the auth user id for this client
    const { data: client } = await admin
      .from('clients')
      .select('owner_user_id')
      .eq('id', clientId)
      .maybeSingle()
    if (!client?.owner_user_id) {
      return NextResponse.json({ error: 'Geen gekoppeld login-account voor deze klant' }, { status: 404 })
    }

    // Update the auth user (email and/or password)
    const authPatch: { email?: string; password?: string } = {}
    if (email) authPatch.email = String(email).trim()
    if (password) authPatch.password = String(password)

    const { error: authErr } = await admin.auth.admin.updateUserById(client.owner_user_id, {
      ...authPatch,
      email_confirm: true,   // keep the email confirmed so login keeps working
    })
    if (authErr) throw new Error(authErr.message)

    // Mirror onto the clients row: email (for display) + the admin-set password
    const rowPatch: Record<string, unknown> = {}
    if (email) rowPatch.email = String(email).trim()
    if (password) rowPatch.login_password = String(password)
    if (Object.keys(rowPatch).length > 0) {
      // Resilient: drop login_password if the column isn't migrated yet.
      let { error } = await admin.from('clients').update(rowPatch).eq('id', clientId)
      if (error && /login_password/i.test(error.message ?? '')) {
        delete rowPatch.login_password
        if (Object.keys(rowPatch).length > 0) {
          ({ error } = await admin.from('clients').update(rowPatch).eq('id', clientId))
        } else { error = null }
      }
      if (error) throw new Error(error.message)
    }

    try { revalidatePath(`/admin/clients/${clientId}`) } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
