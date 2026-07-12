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

// Prefixen bevatten zowel pagina-paden (/admin/…) als API-paden (/api/admin/…):
// de middleware gebruikt pathToModule om werknemers óók op API-niveau per module
// af te schermen (pagina verbergen zonder API-gate is schijnveiligheid).
export const ADMIN_MODULES: AdminModule[] = [
  { key: 'clients',     label: 'Klanten',              prefixes: ['/admin/clients', '/api/admin/clients', '/api/admin/tasks'] },
  { key: 'contracts',   label: 'Contracten',           prefixes: ['/admin/contracts', '/api/admin/contracts', '/api/admin/contract-templates'] },
  { key: 'content',     label: 'Content / Diensten',   prefixes: ['/admin/services', '/api/admin/social-content', '/api/admin/shoot-feedback', '/api/admin/shoot-ideas', '/api/admin/webdesign'] },
  { key: 'metricool',   label: 'Metricool',            prefixes: ['/admin/metricool', '/api/admin/metricool'] },
  { key: 'blogs',       label: 'Blogs',                prefixes: ['/admin/blog-calendar', '/admin/blogaccounts', '/admin/blogs', '/api/admin/blogs', '/api/admin/blog-accounts', '/api/admin/blog-seo', '/api/admin/blog-settings', '/api/admin/framer'] },
  { key: 'partners',    label: 'Partners',             prefixes: ['/admin/partners', '/api/admin/partners'] },
  { key: 'assignments', label: 'Opdrachten',           prefixes: ['/admin/assignments', '/api/admin/assignments'] },
  { key: 'settlements', label: 'Settlements',          prefixes: ['/admin/settlements'] },
  { key: 'finance',     label: 'Prognose & Financiën', prefixes: ['/admin/revenue', '/api/admin/revenue', '/api/admin/costs', '/api/admin/fiscal-settings'] },
  { key: 'invoices',    label: 'Facturen',             prefixes: ['/admin/invoices', '/api/admin/invoices'] },
  { key: 'vesting',     label: 'Vesting',              prefixes: ['/admin/vesting', '/api/admin/vesting'] },
  { key: 'purchases',   label: 'Aankopen',             prefixes: ['/admin/purchases', '/api/admin/purchases'] },
  { key: 'email',       label: 'E-mailcenter',         prefixes: ['/admin/email', '/api/admin/email'] },
  { key: 'info',        label: 'Informatief',          prefixes: ['/admin/informatief', '/admin/onboarding', '/admin/maandplanning', '/api/admin/month-planning', '/api/admin/month-planning-clients'] },
]

/** API-paden die élke actieve werknemer mag gebruiken (module-neutrale pickers).
 *  Bevat enkel niet-gevoelige lijstdata (bv. klantnamen voor dropdowns). */
export const STAFF_API_WHITELIST = ['/api/admin/clients-list']

/** Gevoelige API-paden die ALTIJD admin-only blijven, ook al valt het pad binnen
 *  een module-prefix (wachtwoorden, portaaltoegang, subaccounts, koppel-beheer,
 *  diagnose). Substring-match op het pad. Klant-DELETE blijft daarnaast op
 *  route-niveau admin-only. */
export const STAFF_API_DENY_SUBSTRINGS = [
  '/credentials',
  '/grant-access',
  '/users',
  '/api/admin/metricool/link',
  '/api/admin/metricool/diag',
  '/api/admin/email/diag',
  '/api/admin/email/report-now',
]

export function isStaffApiDenied(path: string): boolean {
  return STAFF_API_DENY_SUBSTRINGS.some((s) => path.includes(s))
}

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
  { key: 'content', label: 'Content/Social', modules: ['clients', 'content', 'metricool', 'blogs', 'info'] },
  { key: 'sales', label: 'Sales/Klanten', modules: ['clients', 'contracts', 'invoices', 'info'] },
  { key: 'operations', label: 'Operations', modules: ['clients', 'content', 'blogs', 'assignments', 'partners', 'info'] },
  { key: 'no_finance', label: 'Alles behalve financieel', modules: ['clients', 'contracts', 'content', 'blogs', 'partners', 'assignments', 'email', 'info'] },
  { key: 'readonly', label: 'Beperkt (klanten + content)', modules: ['clients', 'content'] },
]
