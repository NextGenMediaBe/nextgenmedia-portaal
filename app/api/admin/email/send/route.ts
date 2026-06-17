import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'

async function requireAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

// POST — admin verstuurt bewust een mail naar een klant (nooit automatisch).
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const b = await req.json()
    const toEmail = (b.to_email as string)?.trim()
    const subject = (b.subject as string)?.trim()
    const body = (b.body as string) ?? ''
    if (!toEmail) return NextResponse.json({ error: 'Geen e-mailadres voor deze klant' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'Onderwerp is verplicht' }, { status: 400 })

    const result = await sendEmail({ to: toEmail, subject, text: body })

    const admin = createAdminSupabaseClient()
    await admin.from('email_messages').insert({
      to_email: toEmail,
      to_client_id: b.to_client_id || null,
      subject,
      body,
      template_id: b.template_id || null,
      template_name: b.template_name || null,
      kind: b.kind || 'generic',
      audience: 'client',
      status: result.ok ? 'sent' : 'error',
      error: result.ok ? null : result.error,
      provider_id: result.id || null,
      sent_by: user.id,
      sent_by_email: user.email ?? null,
    })

    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, id: result.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
