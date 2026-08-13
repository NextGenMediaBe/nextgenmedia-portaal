import { safeMessage } from '@/lib/api-error'
import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireStaff } from '@/lib/supabase/server'
import { ensureStages, seedDefaultAvailability } from '@/lib/sales/service'
import { logAudit, requestMeta } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// GET — alle belklanten (voor de klant-selector bovenaan beide schermen).
export async function GET() {
  try {
    if (!(await requireStaff())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data } = await admin
      .from('sales_clients')
      .select('id, name, status, timezone, contact_name, contact_email, phone, buffer_before_min, buffer_after_min, min_notice_min, max_horizon_days, max_per_day, slot_interval_min, default_duration_min')
      .neq('status', 'archived')
      .order('name')
    return NextResponse.json({ clients: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}

// POST — nieuwe belklant. Manueel, geen import (§10).
export async function POST(req: NextRequest) {
  try {
    const actor = await requireStaff()
    if (!actor) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const b = await req.json()
    const name = String(b.name ?? '').trim()
    if (!name) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data, error } = await admin.from('sales_clients').insert({
      name,
      contact_name: String(b.contact_name ?? '').trim() || null,
      contact_email: String(b.contact_email ?? '').trim() || null,
      phone: String(b.phone ?? '').trim() || null,
      timezone: String(b.timezone ?? '').trim() || 'Europe/Brussels',
    }).select('id').single()
    if (error || !data) throw new Error(error?.message ?? 'Aanmaken mislukt')

    // Elke klant start met de vaste fase-set en normale werkuren.
    await ensureStages(data.id as string)
    await seedDefaultAvailability(data.id as string)

    const meta = requestMeta(req)
    await logAudit({
      action: 'sales.client.create', entityType: 'sales_client', entityId: data.id as string,
      summary: `Verkoop: nieuwe klant ${name}`,
      actorUserId: actor.id, actorEmail: actor.email ?? null, actorRole: 'admin',
      ip: meta.ip, userAgent: meta.userAgent,
    })
    return NextResponse.json({ ok: true, id: data.id })
  } catch (err) {
    return NextResponse.json({ error: safeMessage(err) }, { status: 400 })
  }
}
