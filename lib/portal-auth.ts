import 'server-only'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { redirect } from 'next/navigation'
import {
  fullPermissions, can, type Permissions, type PortalModule,
} from '@/lib/portal-permissions'

// Centrale portaal-resolver. Bepaalt voor de ingelogde gebruiker:
//  - bij welke klant hij hoort (owner of subaccount)
//  - of hij actief is
//  - welke rechten hij heeft
// Owners (clients.owner_user_id) krijgen automatisch alle rechten (Eigenaar),
// zodat bestaande klantaccounts exact blijven werken zoals vandaag.

export type PortalSession = {
  userId: string
  clientId: string
  isOwner: boolean
  active: boolean
  permissions: Permissions
  clientUserId: string | null
}

/** Resolveert de portaalsessie van de huidige gebruiker, of null. */
export async function resolvePortalSession(): Promise<PortalSession | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminSupabaseClient()

  // 1) Hoofdaccount (owner) → volledige rechten.
  const { data: ownClient } = await admin
    .from('clients').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (ownClient?.id) {
    return { userId: user.id, clientId: ownClient.id, isOwner: true, active: true, permissions: fullPermissions(), clientUserId: null }
  }

  // 2) Subaccount → rechten uit client_users (lege rechten = volledige als fallback).
  type CURow = { id: string; client_id: string; active: boolean; permissions: unknown }
  let cu: CURow | null = null
  try {
    const { data } = await admin
      .from('client_users')
      .select('id, client_id, active, permissions')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    cu = (data as CURow | null) ?? null
  } catch {
    // Tabel nog niet gemigreerd → geen subaccounts mogelijk, maar app blijft werken.
    cu = null
  }
  if (cu) {
    const perms = (cu.permissions && typeof cu.permissions === 'object' && Object.keys(cu.permissions as object).length > 0)
      ? (cu.permissions as Permissions)
      : fullPermissions()
    return { userId: user.id, clientId: cu.client_id, isOwner: false, active: !!cu.active, permissions: perms, clientUserId: cu.id }
  }

  return null
}

/** Heeft de sessie een bepaald recht? Owner mag altijd alles. */
export function sessionCan(session: PortalSession | null, module: PortalModule, action = 'view'): boolean {
  if (!session || !session.active) return false
  if (session.isOwner) return true
  return can(session.permissions, module, action)
}

type GuardOk = { ok: true; session: PortalSession }
type GuardErr = { ok: false; response: NextResponse }

/**
 * API-guard: controleert ingelogd + actief + (optioneel) module-/actierecht.
 * Gebruik in portal-routes:
 *   const g = await requirePortalPermission('tasks', 'complete'); if (!g.ok) return g.response
 *   // g.session.clientId is veilig te gebruiken
 */
export async function requirePortalPermission(module?: PortalModule, action = 'view'): Promise<GuardOk | GuardErr> {
  const session = await resolvePortalSession()
  if (!session) return { ok: false, response: NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 }) }
  if (!session.active) return { ok: false, response: NextResponse.json({ error: 'Account is gedeactiveerd' }, { status: 403 }) }
  if (module && !sessionCan(session, module, action)) {
    return { ok: false, response: NextResponse.json({ error: 'Geen toestemming voor deze actie' }, { status: 403 }) }
  }
  return { ok: true, session }
}

/**
 * Page-guard voor portaal-servercomponenten. Redirect naar /login als niet
 * ingelogd/inactief, naar /portal als geen view-recht op de module. Geeft anders
 * de sessie terug (met clientId om data op te halen).
 */
export async function requirePortalView(module: PortalModule): Promise<PortalSession> {
  const session = await resolvePortalSession()
  if (!session || !session.active) redirect('/login')
  if (!sessionCan(session, module, 'view')) redirect('/portal')
  return session
}

/** Best-effort: registreer de laatste login van een subaccount. */
export async function touchLastLogin(session: PortalSession): Promise<void> {
  if (!session.clientUserId) return
  try {
    const admin = createAdminSupabaseClient()
    await admin.from('client_users').update({ last_login_at: new Date().toISOString() }).eq('id', session.clientUserId)
  } catch { /* mag nooit breken */ }
}
