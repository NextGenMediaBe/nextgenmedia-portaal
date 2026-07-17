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

/** Zoekt het collectie-OBJECT (met .getFields/.getItems/.addItems/.removeItems). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findCollection(framer: any, collectionId: string): Promise<any | null> {
  const cols = (await framer.getCollections?.()) ?? []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (cols as any[]).find((c) => String(c.id) === String(collectionId)) ?? null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeItem(it: any): FramerItem {
  const fieldData = (it.fieldData ?? {}) as Record<string, unknown>
  const values: Record<string, string> = {}
  for (const [k, entry] of Object.entries(fieldData)) values[k] = displayValue(entry)
  return { framerItemId: String(it.id ?? it.nodeId ?? ''), slug: String(it.slug ?? ''), fieldData, values }
}

/** Alle collecties + hun velden (schema). De lees-/schrijf-methodes zitten op het
 *  collectie-OBJECT (col.getFields/getItems), niet op framer. */
export async function listCollectionsWithSchema(projectUrl: string, apiKey: string): Promise<FramerCollection[]> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const cols = (await framer.getCollections?.()) ?? []
    const out: FramerCollection[] = []
    for (const c of cols) {
      const managedBy = String(c.managedBy ?? (c.readonly ? 'anotherPlugin' : 'user'))
      const editable = c.readonly !== true   // enkel écht read-only uitsluiten
      let fields: FramerField[] = []
      try { fields = fieldsFrom(await c.getFields?.()) } catch { /* niet leesbaar */ }
      out.push({ id: String(c.id), name: String(c.name ?? ''), slugField: c.slugFieldName ?? null, managedBy, editable, fields })
    }
    return out
  })
}

/** Alle items van één collectie (genormaliseerd + ruwe fieldData bewaard). */
export async function getCollectionItems(projectUrl: string, apiKey: string, collectionId: string): Promise<FramerItem[]> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const col = await findCollection(framer, collectionId)
    if (!col) return []
    const items = (await col.getItems?.()) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (items as any[]).map(normalizeItem)
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

/** Voegt nieuwe items toe / werkt bestaande bij op het collectie-object.
 *  `addItems` met een `id` = bijwerken, zonder = nieuw. Geeft de nieuw
 *  aangemaakte Framer-item-id's terug (gekeyd op slug) door na te lezen. */
export async function pushItems(projectUrl: string, apiKey: string, collectionId: string, fields: FramerField[], items: PushItem[]): Promise<Record<string, string>> {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const col = await findCollection(framer, collectionId)
    if (!col) throw new Error('Collectie niet gevonden in Framer')
    if (items.length === 0) return {}

    // Bestaande items updaten via item.setAttributes() (gedocumenteerde weg).
    const updates = items.filter((i) => i.framerItemId)
    const adds = items.filter((i) => !i.framerItemId)

    if (updates.length) {
      const existing = (await col.getItems?.()) ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const byId = new Map((existing as any[]).map((it) => [String(it.id ?? it.nodeId), it]))
      for (const u of updates) {
        const obj = byId.get(String(u.framerItemId))
        const fieldData = buildFieldDataInput(fields, u.values)
        if (obj?.setAttributes) await obj.setAttributes({ slug: u.slug || undefined, fieldData })
        else await col.addItems?.([{ id: u.framerItemId, slug: u.slug || undefined, fieldData }])
      }
    }

    // Nieuwe items toevoegen + hun Framer-item-id opzoeken via de slug.
    const newIds: Record<string, string> = {}
    if (adds.length) {
      await col.addItems?.(adds.map((a) => ({ slug: a.slug, fieldData: buildFieldDataInput(fields, a.values) })))
      const after = (await col.getItems?.()) ?? []
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bySlug = new Map((after as any[]).map((it) => [String(it.slug), String(it.id ?? it.nodeId ?? '')]))
      for (const a of adds) { const nid = bySlug.get(a.slug); if (nid) newIds[a.slug] = nid }
    }
    return newIds
  })
}

/** Verwijdert items uit een collectie (op het collectie-object, op item-id). */
export async function removeItems(projectUrl: string, apiKey: string, collectionId: string, itemIds: string[]): Promise<void> {
  if (itemIds.length === 0) return
  return withFramer(projectUrl, apiKey, async (framer) => {
    const col = await findCollection(framer, collectionId)
    if (col) await col.removeItems?.(itemIds)
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

/** Schrijf-probe: voegt in een bewerkbare collectie één TESTitem toe, leest het
 *  terug en ruimt het weer op. Probeert meerdere fieldData-vormen tot er één
 *  blijft plakken → zo weten we exact hoe Framer waarden verwacht (en of items
 *  als draft worden aangemaakt). Muteert enkel tijdelijk (add + remove), geen publish. */
export async function probeWriteFramer(projectUrl: string, apiKey: string, collectionId?: string) {
  return withFramer(projectUrl, apiKey, async (framer) => {
    const cols = (await framer.getCollections?.()) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const list = cols as any[]
    const col = collectionId
      ? list.find((c) => String(c.id) === String(collectionId))
      : list.find((c) => c.readonly !== true) ?? list[0]
    if (!col) return { ok: false, error: 'Geen bewerkbare collectie gevonden' }

    const fields = fieldsFrom(await col.getFields?.())
    const textField = fields.find((f) => f.type === 'string') ?? fields.find((f) => f.type === 'formattedText') ?? fields[0]
    if (!textField) return { ok: false, error: 'Collectie heeft geen velden' }

    // Ruwe vorm van een BESTAAND item (canonieke read-shape + sleutels).
    const existing = (await col.getItems?.()) ?? []
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ex0 = (existing as any[])[0]
    const existingSample = ex0 ? { id: ex0.id, slug: ex0.slug, draft: ex0.draft, fieldDataKeys: Object.keys(ex0.fieldData ?? {}), fieldData: ex0.fieldData } : null

    const marker = `NGM-DIAG-${Date.now()}`
    const isHtml = textField.type === 'formattedText'
    // Kandidaat-vormen voor fieldData[fieldId].
    const shapes: Array<{ name: string; value: unknown }> = [
      { name: 'typed {type,value}', value: isHtml ? { type: 'formattedText', value: marker, contentType: 'html' } : { type: textField.type, value: marker } },
      { name: 'value-only {value}', value: { value: marker } },
      { name: 'bare string', value: marker },
    ]

    const attempts: Array<Record<string, unknown>> = []
    let winner: string | null = null

    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i]
      const slug = `ngm-diag-${Date.now()}-${i}`
      const fieldData = { [textField.id]: shape.value }
      let createdId: string | null = null
      try {
        await col.addItems?.([{ slug, fieldData }])
        const after = (await col.getItems?.()) ?? []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const created = (after as any[]).find((it) => String(it.slug) === slug)
        createdId = created ? String(created.id ?? created.nodeId ?? '') : null
        const persisted = created ? JSON.stringify(created.fieldData ?? {}).includes(marker) : false
        attempts.push({ shape: shape.name, sent: fieldData, readBack: created?.fieldData ?? null, draft: created?.draft, persisted })
        if (persisted && !winner) winner = shape.name
      } catch (e) {
        attempts.push({ shape: shape.name, sent: fieldData, error: String(e).slice(0, 300) })
      } finally {
        if (createdId) { try { await col.removeItems?.([createdId]) } catch { /* opruimen best-effort */ } }
      }
    }

    return { ok: true, collection: { id: col.id, name: col.name, readonly: col.readonly }, textField, fields, existingSample, winner, attempts }
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
      // De echte methodes zitten op het collectie-OBJECT.
      perCollection.push({
        id: c.id, name: c.name, managedBy: c.managedBy, readonly: c.readonly, slugFieldName: c.slugFieldName,
        objectMethods: {
          getFields: typeof c.getFields === 'function',
          getItems: typeof c.getItems === 'function',
          addItems: typeof c.addItems === 'function',
          removeItems: typeof c.removeItems === 'function',
        },
        fields: await tryOne(() => c.getFields?.()),
        items: await tryOne(() => c.getItems?.()),
      })
    }

    return { methods, collectionCount: cols.length, collections: perCollection }
  })
}
