// Interne werknemers (rol 'employee') + per-module zichtbaarheid binnen de admin.
// Edge-veilig (geen server-only imports): gebruikt in middleware, sidebar én UI.
//
// Admin = ziet alles. Werknemer = enkel modules in staff_members.permissions.
// 'werknemers' (staff-beheer) is ALTIJD admin-only en nooit een togglebare module.

export type AdminModule = {
  key: string
  label: string
  prefixes: string[]   // /admin-paden die bij deze module horen
}

export const ADMIN_MODULES: AdminModule[] = [
  { key: 'clients',     label: 'Klanten',              prefixes: ['/admin/clients'] },
  { key: 'contracts',   label: 'Contracten',           prefixes: ['/admin/contracts'] },
  { key: 'content',     label: 'Content / Diensten',   prefixes: ['/admin/services'] },
  { key: 'blogs',       label: 'Blogs',                prefixes: ['/admin/blog-calendar', '/admin/blogaccounts', '/admin/blogs'] },
  { key: 'partners',    label: 'Partners',             prefixes: ['/admin/partners'] },
  { key: 'assignments', label: 'Opdrachten',           prefixes: ['/admin/assignments'] },
  { key: 'settlements', label: 'Settlements',          prefixes: ['/admin/settlements'] },
  { key: 'finance',     label: 'Prognose & Financiën', prefixes: ['/admin/revenue'] },
  { key: 'invoices',    label: 'Facturen',             prefixes: ['/admin/invoices'] },
  { key: 'vesting',     label: 'Vesting',              prefixes: ['/admin/vesting'] },
  { key: 'purchases',   label: 'Aankopen',             prefixes: ['/admin/purchases'] },
  { key: 'email',       label: 'E-mailcenter',         prefixes: ['/admin/email'] },
  { key: 'info',        label: 'Informatief',          prefixes: ['/admin/informatief', '/admin/onboarding', '/admin/maandplanning', '/admin/voorwaarden'] },
]

/** Module-key voor een /admin-pad (langste prefix wint), of null = niet gegate. */
export function pathToModule(path: string): string | null {
  let best: { key: string; len: number } | null = null
  for (const m of ADMIN_MODULES) {
    for (const p of m.prefixes) {
      if (path === p || path.startsWith(p + '/') || path.startsWith(p + '?')) {
        if (!best || p.length > best.len) best = { key: m.key, len: p.length }
      }
    }
  }
  return best?.key ?? null
}

export function sanitizeModules(input: unknown): string[] {
  const valid = new Set(ADMIN_MODULES.map((m) => m.key))
  return Array.isArray(input) ? input.filter((k): k is string => typeof k === 'string' && valid.has(k)) : []
}

export function canSeeModule(perms: string[] | null | undefined, key: string | null): boolean {
  if (!key) return true       // ongegate pad (bv. /admin command center)
  return !!perms && perms.includes(key)
}

export type StaffPreset = { key: string; label: string; modules: string[] }
export const STAFF_PRESETS: StaffPreset[] = [
  { key: 'content', label: 'Content/Social', modules: ['clients', 'content', 'blogs', 'info'] },
  { key: 'sales', label: 'Sales/Klanten', modules: ['clients', 'contracts', 'invoices', 'info'] },
  { key: 'operations', label: 'Operations', modules: ['clients', 'content', 'blogs', 'assignments', 'partners', 'info'] },
  { key: 'no_finance', label: 'Alles behalve financieel', modules: ['clients', 'contracts', 'content', 'blogs', 'partners', 'assignments', 'email', 'info'] },
  { key: 'readonly', label: 'Beperkt (klanten + content)', modules: ['clients', 'content'] },
]
