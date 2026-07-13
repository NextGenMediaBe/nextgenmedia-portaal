// ── Framer CMS-integratie (server-side only) ─────────────────────────────────
// Beheer de website-CMS van een klant via de Framer Server API (npm: framer-api).
// De klant bewerkt in ONZE app; onze server schrijft naar Framer met de per-klant
// API-key → geen extra Framer-seat nodig. De API-key blijft server-side (nooit
// naar de browser). framer-api is ESM + beta → dynamisch importeren + defensief.

import 'server-only'

export type FramerField = { id: string; name: string; type: string; editable: boolean }
export type FramerCollection = {
  id: string
  name: string
  slugField: string | null
  managedBy: string          // 'user' = door de klant gemaakt (bewerkbaar)
  editable: boolean          // schrijfbaar via de API?
  fields: FramerField[]
}
export type FramerItem = {
  framerItemId: string
  slug: string
  fieldData: Record<string, unknown>     // ruwe Framer-fieldData (voor terugschrijven)
  values: Record<string, string>         // vereenvoudigde weergavewaarden
}

export function framerConfigured(c: { framer_project_url?: string | null; framer_api_key?: string | null } | null | undefined): boolean {
  return !!(c?.framer_project_url && c?.framer_api_key)
}

/** Verbindt met het Framer-project, voert fn uit en verbreekt daarna netjes. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withFramer<T>(projectUrl: string, apiKey: string, fn: (framer: any) => Promise<T>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mod: any
  try {
    mod = await import('framer-api')
  } catch {
    throw new Error('framer-api is niet beschikbaar op de server')
  }
  const connect = mod?.connect
  if (typeof connect !== 'function') throw new Error('framer-api: connect() ontbreekt')
  const framer = await connect(projectUrl, apiKey)
  try {
    return await fn(framer)
  } finally {
    try { await framer?.disconnect?.() } catch { /* best-effort */ }
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldsFrom(raw: any[]): FramerField[] {
  return (raw ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((f: any) => f && f.type !== 'divider' && f.type !== 'unsupported')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((f: any) => ({
      id: String(f.id),
      name: String(f.name ?? f.id ?? ''),
      type: String(f.type ?? 'string'),
      editable: f.userEditable !== false,
    }))
}

/** Ruwe Framer-fieldData-entry → leesbare weergavewaarde (string). */
function displayValue(entry: unknown): string {
  if (entry == null) return ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const e = entry as any
  const v = e.value ?? e
  if (v == null) return ''
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') return String(v.url ?? v.value?.url ?? v.name ?? v.id ?? '')
  return ''
}

/** Alle collecties + hun velden (schema). */
export async function listCollectionsWithSchema(projectUrl: string, apiKey: string): Promise<FramerCollection[]> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const cols = (await framer.getCollections?.()) ?? []
    const out: FramerCollection[] = []
    for (const c of cols) {
      const managedBy = String(c.managedBy ?? (c.readonly ? 'anotherPlugin' : 'user'))
      const editable = managedBy === 'user' && c.readonly !== true
      let fields: FramerField[] = []
      try { fields = fieldsFrom(await framer.getCollectionFields?.(c.id)) } catch { /* niet leesbaar */ }
      out.push({ id: String(c.id), name: String(c.name ?? ''), slugField: c.slugFieldName ?? null, managedBy, editable, fields })
    }
    return out
  })
}

/** Alle items van één collectie (genormaliseerd + ruwe fieldData bewaard). */
export async function getCollectionItems(projectUrl: string, apiKey: string, collectionId: string): Promise<FramerItem[]> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const items = (await (framer.getCollectionItems2?.(collectionId) ?? framer.getCollectionItems?.(collectionId))) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return items.map((it: any) => {
      const fieldData = (it.fieldData ?? {}) as Record<string, unknown>
      const values: Record<string, string> = {}
      for (const [k, entry] of Object.entries(fieldData)) values[k] = displayValue(entry)
      return {
        framerItemId: String(it.externalId ?? it.nodeId ?? it.id ?? ''),
        slug: String(it.slug ?? ''),
        fieldData,
        values,
      }
    }) as FramerItem[]
  })
}

/** Diagnose: ruwe respons zodat we de exacte veldshapes kunnen bevestigen. */
export async function diagnoseFramer(projectUrl: string, apiKey: string) {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const cols = (await framer.getCollections?.()) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const first = cols.find((c: any) => (c.managedBy ? c.managedBy === 'user' : !c.readonly)) ?? cols[0]
    let fieldsSample: unknown = null
    let itemsSample: unknown = null
    if (first) {
      try { fieldsSample = await framer.getCollectionFields?.(first.id) } catch (e) { fieldsSample = String(e) }
      try {
        const items = await (framer.getCollectionItems2?.(first.id) ?? framer.getCollectionItems?.(first.id))
        itemsSample = Array.isArray(items) ? items.slice(0, 2) : items
      } catch (e) { itemsSample = String(e) }
    }
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collections: cols.map((c: any) => ({ id: c.id, name: c.name, managedBy: c.managedBy, readonly: c.readonly, slugFieldName: c.slugFieldName })),
      testedCollection: first?.id ?? null,
      fieldsSample,
      itemsSample,
    }
  })
}
