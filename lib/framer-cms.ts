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
      // Ook managed collecties (bv. door onze blog-integratie gemaakt) mogen
      // door de klant bewerkt worden — enkel écht read-only sluiten we uit.
      const editable = c.readonly !== true
      const fields = fieldsFrom(await readRawFields(framer, c.id))
      out.push({ id: String(c.id), name: String(c.name ?? ''), slugField: c.slugFieldName ?? null, managedBy, editable, fields })
    }
    return out
  })
}

/** Leest velddefinities via de méést werkende methode (user óf managed). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readRawFields(framer: any, id: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tries: Array<() => Promise<any>> = [
    () => framer.getCollectionFields2?.(id),
    () => framer.getCollectionFields?.(id),
    () => framer.getManagedCollectionFields2?.(id),
    () => framer.getManagedCollectionFields?.(id),
  ]
  for (const t of tries) {
    try { const r = await t(); if (Array.isArray(r) && r.length) return r } catch { /* volgende */ }
  }
  return []
}

/** Leest items via de méést werkende methode. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function readRawItems(framer: any, id: string): Promise<any[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tries: Array<() => Promise<any>> = [
    () => framer.getCollectionItems2?.(id),
    () => framer.getCollectionItems?.(id),
  ]
  for (const t of tries) {
    try { const r = await t(); if (Array.isArray(r) && r.length) return r } catch { /* volgende */ }
  }
  return []
}

/** Alle items van één collectie (genormaliseerd + ruwe fieldData bewaard). */
export async function getCollectionItems(projectUrl: string, apiKey: string, collectionId: string): Promise<FramerItem[]> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const items = await readRawItems(framer, collectionId)
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

// ── Schrijven + publiceren ────────────────────────────────────────────────────
// De klant bewerkt eenvoudige waarden (strings) in de app; we bouwen daaruit de
// Framer-veld-input per veldtype op. Beeld/bestand = URL-string; enum = case-id;
// referenties = item-id('s). Bevestigen via /diag met echte data.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildFieldDataInput(fields: FramerField[], values: Record<string, string>): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out: Record<string, any> = {}
  for (const f of fields) {
    if (!(f.id in values)) continue
    const v = values[f.id] ?? ''
    switch (f.type) {
      case 'number': out[f.id] = { type: 'number', value: v === '' ? null : Number(v) }; break
      case 'boolean': out[f.id] = { type: 'boolean', value: v === 'true' || v === '1' || v === 'on' }; break
      case 'formattedText': out[f.id] = { type: 'formattedText', value: String(v), contentType: 'html' }; break
      case 'image': out[f.id] = { type: 'image', value: v ? String(v) : null }; break
      case 'file': out[f.id] = { type: 'file', value: v ? String(v) : null }; break
      case 'date': out[f.id] = { type: 'date', value: v || null }; break
      case 'enum': out[f.id] = { type: 'enum', value: v || null }; break
      case 'color': out[f.id] = { type: 'color', value: String(v) }; break
      case 'link': out[f.id] = { type: 'link', value: String(v) }; break
      case 'collectionReference': out[f.id] = { type: 'collectionReference', value: v || null }; break
      case 'multiCollectionReference': out[f.id] = { type: 'multiCollectionReference', value: v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [] }; break
      default: out[f.id] = { type: 'string', value: String(v) }
    }
  }
  return out
}

export type PushItem = { framerItemId: string | null; slug: string; values: Record<string, string> }

/** Voegt nieuwe items toe / werkt bestaande bij in een collectie. Geeft de
 *  nieuw aangemaakte Framer-item-id's terug (gekeyd op slug). */
export async function pushItems(projectUrl: string, apiKey: string, collectionId: string, fields: FramerField[], items: PushItem[]): Promise<Record<string, string>> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const newIds: Record<string, string> = {}
    for (const it of items) {
      const fieldData = buildFieldDataInput(fields, it.values)
      if (it.framerItemId) {
        await (framer.setCollectionItemAttributes2?.(it.framerItemId, { slug: it.slug || undefined, fieldData })
          ?? framer.setCollectionItemAttributes?.(it.framerItemId, { slug: it.slug || undefined, fieldData }))
      } else {
        const res = await (framer.addCollectionItems2?.(collectionId, [{ slug: it.slug, fieldData }])
          ?? framer.addCollectionItems?.(collectionId, [{ slug: it.slug, fieldData }]))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const row: any = Array.isArray(res) ? res[0] : null
        if (row) newIds[it.slug] = String(row.externalId ?? row.nodeId ?? row.id ?? '')
      }
    }
    return newIds
  })
}

/** Verwijdert items uit een collectie (op Framer-item-id). */
export async function removeItems(projectUrl: string, apiKey: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  return withFramer(projectUrl, apiKey, async (framer) => {
    await framer.removeCollectionItems?.(itemIds)
  })
}

/** Publiceert de wijzigingen naar de live Framer-website (publish → deploy). */
export async function publishSite(projectUrl: string, apiKey: string): Promise<{ ok: boolean; deploymentId?: string | null }> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await framer.publish?.()
    const deploymentId: string | null = result?.deployment?.id ?? null
    if (deploymentId && typeof framer.deploy === 'function') {
      try { await framer.deploy(deploymentId) } catch { /* productie-deploy best-effort */ }
    }
    return { ok: true, deploymentId }
  })
}

/** Diagnose: probeert per collectie ELKE lees-methode (user + managed) en toont
 *  de ruwe respons/fout, zodat we exact zien wat werkt en hoe de velden/items
 *  serialiseren. */
export async function diagnoseFramer(projectUrl: string, apiKey: string) {
  return withFramer(projectUrl, apiKey, async (framer) => {
    // Welke methodes bestaan op deze framer-versie?
    const methodNames = ['getCollections', 'getCollectionFields', 'getCollectionFields2', 'getCollectionItems', 'getCollectionItems2', 'getManagedCollections', 'getManagedCollectionFields', 'getManagedCollectionFields2', 'getManagedCollectionItemIds', 'addCollectionItems2', 'setCollectionItemAttributes2', 'removeCollectionItems', 'publish', 'deploy']
    const methods: Record<string, boolean> = {}
    for (const m of methodNames) methods[m] = typeof framer[m] === 'function'

    const cols = (await framer.getCollections?.()) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tryOne = async (fn: () => Promise<any>) => {
      try { const r = await fn(); return { ok: true, count: Array.isArray(r) ? r.length : undefined, sample: Array.isArray(r) ? r.slice(0, 2) : r } }
      catch (e) { return { ok: false, error: String(e).slice(0, 200) } }
    }

    const perCollection = []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of cols as any[]) {
      perCollection.push({
        id: c.id, name: c.name, managedBy: c.managedBy, readonly: c.readonly, slugFieldName: c.slugFieldName,
        getCollectionFields: await tryOne(() => framer.getCollectionFields?.(c.id)),
        getCollectionFields2: await tryOne(() => framer.getCollectionFields2?.(c.id)),
        getManagedCollectionFields2: await tryOne(() => framer.getManagedCollectionFields2?.(c.id)),
        getCollectionItems2: await tryOne(() => framer.getCollectionItems2?.(c.id)),
        getCollectionItems: await tryOne(() => framer.getCollectionItems?.(c.id)),
      })
    }

    return { methods, collectionCount: cols.length, collections: perCollection }
  })
}
