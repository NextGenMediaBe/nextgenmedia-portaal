import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { notifyClientScriptActivity } from '@/lib/admin-alerts'
import { requirePortalPermission, sessionCan } from '@/lib/portal-auth'
import { logAudit, requestMeta } from '@/lib/audit'

export async function POST(req: NextRequest) {
  try {
    const g = await requirePortalPermission('social_media', 'view')
    if (!g.ok) return g.response
    const { session } = g

    const { id, decision, feedback } = await req.json()

    // Goedkeuren vereist approve_scripts; wijziging vragen vereist feedback-recht.
    if (decision === 'approved' && !sessionCan(session, 'social_media', 'approve_scripts')) {
      return NextResponse.json({ error: 'Geen toestemming om scripts goed te keuren' }, { status: 403 })
    }
    if (decision === 'changes_requested') {
      if (!sessionCan(session, 'social_media', 'feedback')) {
        return NextResponse.json({ error: 'Geen toestemming om feedback te geven' }, { status: 403 })
      }
      if (!feedback?.trim()) return NextResponse.json({ error: 'Feedback is verplicht bij wijzigingsverzoek' }, { status: 400 })
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin
      .from('social_content_items')
      .update({
        status: decision,
        client_feedback: feedback || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', session.clientId)

    if (error) throw new Error(error.message)

    try {
      revalidatePath('/portal')
      revalidatePath('/portal/social-media')
      revalidatePath('/admin/services/social-media')
    } catch { }

    const meta = requestMeta(req)
    await logAudit({
      action: decision === 'approved' ? 'portal.script.approved' : 'portal.script.changes_requested',
      entityType: 'social_content_item', entityId: id,
      summary: decision === 'approved' ? 'Script goedgekeurd via portaal' : 'Wijziging gevraagd via portaal',
      actorUserId: session.userId, actorRole: 'client',
      metadata: { client_id: session.clientId, by_subaccount: !session.isOwner }, ip: meta.ip, userAgent: meta.userAgent,
    })

    // Directe interne adminmail met 1-uur bundeling per klant (best-effort).
    await notifyClientScriptActivity(session.clientId)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
