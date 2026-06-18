import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/email'
import { buildEmailHtml, buildEmailText } from '@/lib/email-html'

// Publieke bucket: permanente URL die mailclients altijd kunnen tonen.
const BUCKET = 'email-assets'

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
    const ctaText = (b.cta_text as string)?.trim() || null
    const ctaLink = (b.cta_link as string)?.trim() || null
    if (!toEmail) return NextResponse.json({ error: 'Geen e-mailadres voor deze klant' }, { status: 400 })
    if (!subject) return NextResponse.json({ error: 'Onderwerp is verplicht' }, { status: 400 })

    const admin = createAdminSupabaseClient()

    // Handtekening: 'NONE' = geen, 'DEFAULT'/leeg = standaard, anders specifiek id.
    let signatureUrl: string | null = null
    let signatureName: string | null = null
    const choice = b.signature_id as string | null | undefined
    let sigId: string | null = null
    if (choice === 'NONE') {
      sigId = null
    } else if (!choice || choice === 'DEFAULT') {
      const { data: def } = await admin.from('email_signatures').select('id').eq('is_default', true).maybeSingle()
      sigId = def?.id ?? null
    } else {
      sigId = choice
    }
    if (sigId) {
      const { data: sig } = await admin.from('email_signatures').select('name, image_path').eq('id', sigId).maybeSingle()
      if (sig) {
        signatureName = sig.name
        if (sig.image_path) {
          signatureUrl = admin.storage.from(BUCKET).getPublicUrl(sig.image_path).data.publicUrl
        }
      }
    }

    const htmlOpts = { bodyText: body, ctaText, ctaLink, signatureUrl, signatureName }
    const html = buildEmailHtml(htmlOpts)
    const text = buildEmailText(htmlOpts)

    const result = await sendEmail({ to: toEmail, subject, text, html })

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
