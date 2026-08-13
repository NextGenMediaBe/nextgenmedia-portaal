// Ontdubbelen en zoeken (§4, §11). Pure module.

/**
 * Sleutel waarop we bedrijven ontdubbelen: de website-host als die er is,
 * anders de genormaliseerde naam. Zo herkennen we "Acme BV" en "acme bvba" met
 * dezelfde site als één bedrijf — nooit twee leads voor hetzelfde bedrijf bij
 * dezelfde klant.
 */
export function companyDedupeKey(name: string, website?: string | null): string {
  const host = websiteHost(website)
  if (host) return `web:${host}`
  return `name:${normalizeName(name)}`
}

/** Host uit een URL, zonder www en zonder pad. Lege/onzinnige input → null. */
export function websiteHost(website?: string | null): string | null {
  const raw = (website ?? '').trim()
  if (!raw) return null
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    return host.includes('.') ? host : null
  } catch {
    return null
  }
}

// Rechtsvormen die niets zeggen over wélk bedrijf het is.
const LEGAL_FORMS = new Set([
  'bv', 'bvba', 'nv', 'vzw', 'commv', 'cv', 'cvba', 'sa', 'sprl', 'srl',
  'gcv', 'vof', 'ltd', 'limited', 'llc', 'inc', 'gmbh', 'ag', 'plc', 'bvi',
])

/** Bedrijfsnaam normaliseren: rechtsvormen, leestekens en spaties eruit. */
export function normalizeName(name: string): string {
  const base = (name ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // accenten weg
    .replace(/\./g, '')                                  // "n.v." → "nv"

  const tokens = base.split(/[^a-z0-9]+/).filter(Boolean)
  const kept = tokens.filter((tk) => !LEGAL_FORMS.has(tk))
  // Bestaat de naam alleen uit een rechtsvorm, houd hem dan zoals hij is —
  // anders zouden twee zulke bedrijven dezelfde (lege) sleutel krijgen.
  return (kept.length ? kept : tokens).join('')
}

/**
 * Telefoonnummer tot enkel cijfers, met de Belgische landcode eraf zodat
 * "+32 470 12 34 56", "0470/12.34.56" en "470123456" allemaal hetzelfde
 * opleveren en dus op elkaar matchen (§4).
 */
export function normalizePhone(phone?: string | null): string {
  let d = (phone ?? '').replace(/\D+/g, '')
  if (!d) return ''
  if (d.startsWith('0032')) d = d.slice(4)
  else if (d.startsWith('32') && d.length > 9) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  return d
}

/** Matcht een zoekterm op een telefoonnummer, ongeacht schrijfwijze? */
export function phoneMatches(stored: string | null | undefined, query: string): boolean {
  const q = normalizePhone(query)
  if (!q) return false
  const s = normalizePhone(stored)
  return !!s && s.includes(q)
}

/** Ziet de zoekterm eruit als een telefoonnummer (i.p.v. een naam)? */
export function looksLikePhone(query: string): boolean {
  const digits = query.replace(/\D+/g, '')
  return digits.length >= 3 && digits.length / Math.max(1, query.trim().length) > 0.5
}
