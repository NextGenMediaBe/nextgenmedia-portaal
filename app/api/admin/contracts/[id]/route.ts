import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

// PATCH — update contract status (send / cancel)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()
    const { action } = await req.json()

    if (action === 'send') {
      const { error } = await admin
        .from('contracts')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
      try { await admin.from('contract_events').insert({ contract_id: id, event_type: 'sent' }) } catch { }
    } else if (action === 'cancel') {
      const { error } = await admin
        .from('contracts')
        .update({ status: 'cancelled' })
        .eq('id', id)
      if (error) throw new Error(error.message)
      try { await admin.from('contract_events').insert({ contract_id: id, event_type: 'cancelled' }) } catch { }
    } else {
      return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 })
    }

    // Invalidate caches so admin + portal contract pages refresh
    try {
      revalidatePath('/admin/contracts')
      revalidatePath(`/admin/contracts/${id}`)
      revalidatePath('/portal/contracts')
      revalidatePath('/portal')
    } catch { }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}

// DELETE — permanently remove a contract and its storage files
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await requireAdmin()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const admin = createAdminSupabaseClient()

    // Prevent deleting a signed contract by accident — require explicit force
    // Read body FIRST (stream can only be read once)
    const { force } = await req.json().catch(() => ({ force: false }))

    // Fetch storage paths before deleting
    const { data: contract, error: fetchError } = await admin
      .from('contracts')
      .select('*')
      .eq('id', id)
      .maybeSingle()

    if (fetchError) throw new Error(fetchError.message)
    if (!contract) return NextResponse.json({ error: 'Contract niet gevonden' }, { status: 404 })
    if (contract.status === 'signed' && !force) {
      return NextResponse.json(
        { error: 'Dit contract is ondertekend. Stuur force: true mee om toch te verwijderen.' },
        { status: 409 }
      )
    }

    // Delete contract (cascades: contract_signatures, contract_events)
    const { error } = await admin.from('contracts').delete().eq('id', id)
    if (error) throw new Error(error.message)

    // Clean up storage files — best effort
    const paths = [contract.pdf_path, contract.signed_pdf_path].filter((p): p is string => !!p)
    if (paths.length > 0) {
      try { await admin.storage.from('contracts').remove(paths) } catch { }
    }

    // Invalidate caches so deleted contract disappears from all lists immediately
    try {
      revalidatePath('/admin/contracts')
      revalidatePath('/portal/contracts')
      revalidatePath('/portal')
      if (contract.client_id) {
        revalidatePath(`/admin/clients/${contract.client_id}`)
      }
    } catch { }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
