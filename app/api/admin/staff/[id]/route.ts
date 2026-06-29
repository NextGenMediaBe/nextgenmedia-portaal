import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { logAudit, requestMeta } from '@/lib/audit'
import { sanitizeModules } from '@/lib/staff'
import { revalidatePath } from 'next/cache'

// PATCH — werknemer bijwerken: naam / actief / permissions / wachtwoord.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const b = await req.json()
    const admin = createAdminSupabaseClient()

    const { data: staff } = await admin.from('staff_members').select('auth_user_id').eq('id', id).maybeSingle()
    if (!staff) return NextResponse.json({ error: 'Werknemer niet gevonden' }, { status: 404 })

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof b.name === 'string') patch.name = b.name.trim() || null
    if (typeof b.active === 'boolean') patch.active = b.active
    if (Array.isArray(b.permissions)) patch.permissions = sanitizeModules(b.permissions)

    if (b.password) {
      if (String(b.password).length < 8) return NextResponse.json({ error: 'Wachtwoord moet minstens 8 tekens zijn' }, { status: 400 })
      if (staff.auth_user_id) {
        const { error } = await admin.auth.admin.updateUserById(staff.auth_user_id, { password: String(b.password), email_confirm: true })
        if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    const { error } = await admin.from('staff_members').update(patch).eq('id', id)
    if (error) throw new Error(error.message)

    const meta = requestMeta(req)
    await logAudit({
      action: 'staff.updated', entityType: 'staff_member', entityId: id,
      summary: `Werknemer bijgewerkt${Array.isArray(b.permissions) ? ' (rechten)' : ''}${typeof b.active === 'boolean' ? (b.active ? ' (geactiveerd)' : ' (gedeactiveerd)') : ''}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      metadata: { modules: Array.isArray(b.permissions) ? sanitizeModules(b.permissions) : undefined }, ip: meta.ip, userAgent: meta.userAgent,
    })
    try { revalidatePath('/admin/werknemers') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE — werknemer + auth-account verwijderen.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireAdmin()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const { id } = await params
    const admin = createAdminSupabaseClient()
    const { data: staff } = await admin.from('staff_members').select('auth_user_id, email').eq('id', id).maybeSingle()
    if (!staff) return NextResponse.json({ error: 'Werknemer niet gevonden' }, { status: 404 })

    const { error } = await admin.from('staff_members').delete().eq('id', id)
    if (error) throw new Error(error.message)
    if (staff.auth_user_id) {
      try { await admin.from('user_roles').delete().eq('user_id', staff.auth_user_id) } catch { }
      try { await admin.auth.admin.deleteUser(staff.auth_user_id) } catch { }
    }
    const meta = requestMeta(req)
    await logAudit({
      action: 'staff.deleted', entityType: 'staff_member', entityId: id,
      summary: `Werknemer verwijderd (${staff.email ?? id})`, actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })
    try { revalidatePath('/admin/werknemers') } catch { }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
