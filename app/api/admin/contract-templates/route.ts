import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient, insertResilient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

// GET — alle templates (admin).
export async function GET() {
  try {
    const user = await requireAdminUser()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const { data } = await admin
      .from('contract_templates')
      .select('id, name, category, pdf_path, detected_fields, active, created_at')
      .order('created_at', { ascending: false })
    return NextResponse.json({ templates: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// POST — nieuwe template (naam, categorie, PDF). PDF in contracts-bucket onder templates/.
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const formData = await req.formData()
    const pdf = formData.get('pdf') as File | null
    const name = (formData.get('name') as string)?.trim()
    const category = (formData.get('category') as string)?.trim() || null
    if (!name) return NextResponse.json({ error: 'Naam is verplicht' }, { status: 400 })

    const { data: tpl, error: tplErr } = await insertResilient(
      admin,
      'contract_templates',
      { name, category, active: true, created_by: user.id },
      { required: ['name'] },
    )
    if (tplErr || !tpl) throw new Error(tplErr?.message ?? 'Aanmaken mislukt')
    const templateId = tpl.id as string

    if (pdf) {
      const arrayBuffer = await pdf.arrayBuffer()
      const pdfPath = `templates/${templateId}.pdf`
      const { error: uploadErr } = await admin.storage
        .from('contracts')
        .upload(pdfPath, Buffer.from(arrayBuffer), { contentType: 'application/pdf', upsert: true })
      if (uploadErr) {
        await admin.from('contract_templates').delete().eq('id', templateId)
        throw new Error(`PDF upload mislukt: ${uploadErr.message}`)
      }
      await admin.from('contract_templates').update({ pdf_path: pdfPath }).eq('id', templateId)
    }

    try { revalidatePath('/admin/contracts/templates') } catch { }
    return NextResponse.json({ id: templateId })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
