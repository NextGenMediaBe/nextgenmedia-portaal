import 'server-only'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'

export type Actor = {
  userId: string
  isAdmin: boolean
  /** null = admin (alles); anders de toegestane module-keys van de werknemer. */
  modules: string[] | null
}

/**
 * Wie is de ingelogde admin/werknemer en welke modules mag die zien?
 * Rol + rechten worden via de SERVICE-ROLE gelezen (user_roles heeft een
 * restrictieve policy waardoor een niet-admin zijn eigen rij niet kan lezen).
 *
 * Gebruik dit voor shell-brede endpoints (globale zoek, notificaties) die zowel
 * admin als werknemer moeten bedienen: de route filtert dan zélf per module,
 * i.p.v. de werknemer volledig buiten te sluiten.
 */
export async function getActor(): Promise<Actor | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createAdminSupabaseClient()
  const { data: roleRow } = await admin
    .from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  if (roleRow?.role === 'admin') return { userId: user.id, isAdmin: true, modules: null }

  const { data: staff } = await admin
    .from('staff_members').select('active, permissions').eq('auth_user_id', user.id).maybeSingle()
  if (!staff || staff.active === false) return null

  const perms = Array.isArray(staff.permissions) ? (staff.permissions as string[]) : []
  return { userId: user.id, isAdmin: false, modules: perms }
}

/** Mag deze actor de gegeven module zien? Admin altijd. */
export function actorCanSee(actor: Actor, moduleKey: string): boolean {
  return actor.modules === null || actor.modules.includes(moduleKey)
}
