import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

function randomPassword(): string {
  const bytes = new Uint8Array(18)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, 'x')
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (roleData?.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const body = await req.json()
    const {
      email, full_name, company_name, phone, vat_number,
      roles, hourly_rate, default_commission_pct, region, password,
    } = body

    const finalPassword = password && password.length >= 8 ? password : randomPassword()
    const adminSetPassword = Boolean(password && password.length >= 8)

    const { data: created, error: authErr } = await admin.auth.admin.createUser({
      email,
      password: finalPassword,
      email_confirm: true,
      user_metadata: { name: full_name },
    })
    if (authErr || !created.user) throw new Error(authErr?.message || 'Aanmaken mislukt')

    await admin.from('user_roles').insert({ user_id: created.user.id, role: 'freelancer' })

    const { data: partner, error: partnerErr } = await admin
      .from('freelancers')
      .insert({
        user_id: created.user.id,
        email,
        name: full_name,
        company: company_name || null,
        phone: phone || null,
        vat_number: vat_number || null,
        roles: roles ?? [],
        hourly_rate: hourly_rate ?? null,
        commission_pct: default_commission_pct ?? 10,
        region: region || null,
        active: true,
      })
      .select('id')
      .single()

    if (partnerErr) throw new Error(partnerErr.message)

    let inviteLink: string | null = null
    if (!adminSetPassword) {
      try {
        const { data: link } = await admin.auth.admin.generateLink({
          type: 'recovery',
          email,
        })
        inviteLink = link?.properties?.action_link ?? null
      } catch {
        inviteLink = null
      }
    }

    return NextResponse.json({ id: partner.id, inviteLink, passwordSet: adminSetPassword })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
