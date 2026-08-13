import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { listPipelines } from '@/lib/sales/pipelines'
import { reminderBody } from '@/lib/sales/reminders'
import { sendEmail, baseUrl, EMAIL_FROM } from '@/lib/email'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

// De twee merken (NextGenMedia, NextGenSolutions) en de instellingen van hun
// herinneringsmail: aan/uit, afzender, antwoordadres en de brochure.

export async function GET() {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const pipelines = await listPipelines()
    return NextResponse.json({ pipelines, defaultFrom: EMAIL_FROM })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()

    const pipelines = await listPipelines()
    const target = pipelines.find((p) => p.id === String(b.id ?? ''))
    if (!target) return NextResponse.json({ error: 'Pipeline niet gevonden' }, { status: 404 })

    const text = (v: unknown) => {
      const s = String(v ?? '').trim()
      return s === '' ? null : s
    }

    const admin = createAdminSupabaseClient()
    const { error } = await admin.from('sales_pipelines').update({
      reminder_enabled: b.reminder_enabled !== false,
      reminder_from: text(b.reminder_from),
      reminder_reply_to: text(b.reminder_reply_to),
      brochure_url: text(b.brochure_url),
      brochure_filename: text(b.brochure_filename),
    }).eq('id', target.id)
    if (error) throw new Error(error.message)

    const meta = requestMeta(req)
    await logAudit({
      action: 'sales.pipeline.update', entityType: 'sales_pipeline', entityId: target.id,
      summary: `Verkoop: herinneringsmail ${target.name} aangepast`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

/**
 * POST — testmail naar jezelf. Exact dezelfde tekst, afzender en bijlage als de
 * echte herinnering, zodat je vóór de eerste prospect ziet wat er vertrekt.
 * Gaat nooit naar een prospect: het adres wordt hier ingetikt.
 */
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()

    const pipelines = await listPipelines()
    const p = pipelines.find((x) => x.id === String(b.id ?? ''))
    if (!p) return NextResponse.json({ error: 'Pipeline niet gevonden' }, { status: 404 })

    const to = String(b.to ?? '').trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'Vul een geldig e-mailadres in' }, { status: 400 })
    }

    const lines = reminderBody({ hour: '14:00', today: false, signer: 'Bram' })
    const attachments = p.brochure_url
      ? [{
          filename: p.brochure_filename || 'Kennismaking.pdf',
          path: p.brochure_url.startsWith('http') ? p.brochure_url : `${baseUrl()}${p.brochure_url}`,
        }]
      : []

    const res = await sendEmail({
      to,
      subject: `[TEST — ${p.name}] Tot morgen om 14:00`,
      text: lines.join('\n'),
      from: p.reminder_from,
      replyTo: p.reminder_reply_to,
      attachments,
    })
    if (!res.ok) return NextResponse.json({ error: res.error ?? 'Versturen mislukt' }, { status: 502 })
    return NextResponse.json({ ok: true, attached: attachments.length > 0 })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
