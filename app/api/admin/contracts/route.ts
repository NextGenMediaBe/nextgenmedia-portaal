import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (roleData?.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const formData = await req.formData()
    const pdf = formData.get('pdf') as File | null
    const client_id = formData.get('client_id') as string
    const title = formData.get('title') as string
    const service_slug = formData.get('service_slug') as string | null
    const signer_name = formData.get('signer_name') as string | null
    const signer_email = formData.get('signer_email') as string | null

    if (!pdf || !client_id || !title) {
      return NextResponse.json({ error: 'Ontbrekende velden' }, { status: 400 })
    }

    // Create contract record first to get the ID
    const accessToken = randomUUID()
    const { data: contract, error: contractErr } = await admin
      .from('contracts')
      .insert({
        client_id,
        title,
        service_slug: service_slug || null,
        status: 'draft',
        signer_name: signer_name || null,
        signer_email: signer_email || null,
        access_token: accessToken,
      })
      .select('id')
      .single()

    if (contractErr || !contract) throw new Error(contractErr?.message ?? 'Aanmaken mislukt')

    // Upload PDF
    const arrayBuffer = await pdf.arrayBuffer()
    const pdfPath = `${client_id}/${contract.id}.pdf`
    const { error: uploadErr } = await admin.storage
      .from('contracts')
      .upload(pdfPath, Buffer.from(arrayBuffer), {
        contentType: 'application/pdf',
        upsert: true,
      })

    if (uploadErr) {
      // Clean up contract if upload fails
      await admin.from('contracts').delete().eq('id', contract.id)
      throw new Error(`PDF upload mislukt: ${uploadErr.message}`)
    }

    // Update contract with pdf_path
    await admin.from('contracts').update({ pdf_path: pdfPath }).eq('id', contract.id)

    // Invalidate caches so new contract appears in lists immediately
    try {
      revalidatePath('/admin/contracts')
      revalidatePath(`/admin/clients/${client_id}`)
    } catch { }

    return NextResponse.json({ id: contract.id })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
