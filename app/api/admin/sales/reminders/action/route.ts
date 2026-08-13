import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { getOrCreateSalesOrg } from '@/lib/sales/service'
import { cancelReminderManually, rescheduleReminder } from '@/lib/sales/reminders'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Handmatig ingrijpen op een herinneringsmail: tegenhouden, op een ander moment
 * zetten, of meteen versturen.
 *
 * "Meteen versturen" is hetzelfde als verzetten naar nu — één weg door de code,
 * zodat er geen tweede variant kan ontstaan die zich net anders gedraagt.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()

    const appointmentId = String(b.appointmentId ?? '')
    const action = String(b.action ?? '')
    if (!appointmentId) return NextResponse.json({ error: 'Afspraak ontbreekt' }, { status: 400 })

    // De afspraak moet van ons zijn; een id van buiten mag hier niets doen.
    const admin = createAdminSupabaseClient()
    const org = await getOrCreateSalesOrg()
    const { data: own } = await admin.from('sales_appointments')
      .select('id').eq('id', appointmentId).eq('sales_client_id', org.id).maybeSingle()
    if (!own) return NextResponse.json({ error: 'Afspraak niet gevonden' }, { status: 404 })

    const meta = requestMeta(req)
    const log = (summary: string) => logAudit({
      action: `sales.reminder.${action}`, entityType: 'sales_appointment', entityId: appointmentId,
      summary, actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })

    if (action === 'cancel') {
      const res = await cancelReminderManually(appointmentId, actor.id)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      await log('Verkoop: herinneringsmail tegengehouden')
      return NextResponse.json({ ok: true, message: res.message })
    }

    if (action === 'send_now') {
      const res = await rescheduleReminder(appointmentId, Date.now(), actor.id)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      await log('Verkoop: herinneringsmail meteen verstuurd')
      return NextResponse.json({ ok: true, message: res.message })
    }

    if (action === 'reschedule') {
      const at = new Date(String(b.at ?? '')).getTime()
      if (!Number.isFinite(at)) return NextResponse.json({ error: 'Kies een geldig tijdstip' }, { status: 400 })
      const res = await rescheduleReminder(appointmentId, at, actor.id)
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 })
      await log('Verkoop: verzendmoment van een herinneringsmail gewijzigd')
      return NextResponse.json({ ok: true, message: res.message })
    }

    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
