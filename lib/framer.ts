import 'server-only'
import { decryptSecret } from '@/lib/crypto'

// Server-side Framer-publicatie. API-calls gebeuren UITSLUITEND hier (server),
// nooit vanuit de frontend. De API key wordt versleuteld bewaard en pas hier
// ontsleuteld.
//
// STATUS: de effectieve Framer Server API-aanroepen zitten achter deze interface
// en zijn nog NIET geactiveerd, omdat de exacte methodenamen van het
// `framer-api`-package geverifieerd moeten worden tegen de officiële docs:
//   https://www.framer.com/developers/server-api-quick-start
//   https://www.framer.com/developers/server-api-reference
//   https://www.framer.com/developers/cms
// Bedoelde flow (één keer activeren na verificatie):
//   1. const client = connect(projectUrl, apiKey)
//   2. const collection = await client.getCollection(collectionId)
//   3. const fieldData = buildFieldData(fieldMap, blog)
//   4. bestaand item? update : add  (idempotent op slug / framer_item_id)
//   5. const changed = await collection.getChangedPaths()  → safety check
//   6. await collection.publish()
//   7. await client.deploy()
//   8. finally: await client.disconnect()

export type FramerClientConfig = {
  projectUrl: string | null
  apiKeyEncrypted: string | null
  collectionId: string | null
  fieldMap: Record<string, string> | null
}

export type BlogForPublish = {
  id: string
  titel: string
  slug: string
  content: string | null
  meta_title: string | null
  meta_description: string | null
  thumbnail_url: string | null
  framer_item_id: string | null
}

export type PublishResult = {
  ok: boolean
  pending?: boolean          // integratie nog niet geactiveerd (geen echte fout)
  framerItemId?: string
  error?: string
  warning?: string           // bv. onverwachte getChangedPaths
}

// Slug is in Framer de ingebouwde item-slug (geen CMS-veld), dus niet verplicht
// in de field-map. Enkel titel + content moeten gemapt zijn.
const REQUIRED_FIELDS = ['titel', 'content'] as const

/** Controleert of alle Framer-config aanwezig is om te mogen publiceren. */
export function validateFramerConfig(c: FramerClientConfig): { ok: boolean; missing: string[] } {
  const missing: string[] = []
  if (!c.projectUrl) missing.push('Framer project URL')
  if (!decryptSecret(c.apiKeyEncrypted)) missing.push('Framer API key')
  if (!c.collectionId) missing.push('Framer collection ID')
  const fm = c.fieldMap
  if (!fm || typeof fm !== 'object') missing.push('Field map')
  else for (const f of REQUIRED_FIELDS) if (!fm[f]) missing.push(`Field map: ${f}`)
  return { ok: missing.length === 0, missing }
}

/** Bouwt de fieldData op basis van de field-map (field IDs → blogwaarden). */
export function buildFieldData(fieldMap: Record<string, string>, blog: BlogForPublish): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const set = (key: string, value: unknown) => { if (fieldMap[key]) out[fieldMap[key]] = value }
  set('titel', blog.titel)
  set('content', blog.content ?? '')
  set('slug', blog.slug)
  set('datum', new Date().toISOString())
  set('thumbnail', blog.thumbnail_url ?? '')
  return out
}

/**
 * Publiceert een (reeds GOEDGEKEURDE) blog naar Framer.
 * Tot de framer-api integratie geverifieerd + geactiveerd is, geeft dit een
 * `pending`-resultaat terug i.p.v. een echte publicatie — zo gaat er nooit
 * ongeteste/niet-goedgekeurde content live en blijft de build groen.
 */
export async function publishBlogToFramer(config: FramerClientConfig, blog: BlogForPublish, opts?: { confirmOverride?: boolean }): Promise<PublishResult> {
  const v = validateFramerConfig(config)
  if (!v.ok) return { ok: false, error: `Ontbrekende Framer-configuratie: ${v.missing.join(', ')}` }

  // Veiligheids-/idempotentie-voorbereiding (klaar voor de echte client):
  const apiKey = decryptSecret(config.apiKeyEncrypted)
  void apiKey; void opts // gebruikt zodra de echte client geactiveerd is
  const fieldData = buildFieldData(config.fieldMap as Record<string, string>, blog)
  void fieldData

  if (process.env.FRAMER_ENABLED !== 'true') {
    return {
      ok: false,
      pending: true,
      error: 'Framer-publicatie is nog niet geactiveerd. Configuratie is volledig — zet FRAMER_ENABLED=true en test op één klant om live te publiceren.',
    }
  }

  // ── Echte per-klant publicatie via framer-api (connect → … → disconnect) ────
  // connect() neemt per aanroep project + key → elke klant publiceert naar zijn
  // eigen Framer-project. Dynamische import zodat de (ESM) package alleen laadt
  // wanneer er effectief gepubliceerd wordt.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let framer: any = null
  try {
    const mod = await import('framer-api')
    framer = await mod.connect(config.projectUrl as string, apiKey)

    const collections = await framer.getCollections()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const collection = (collections as any[]).find((c) => c.id === config.collectionId)
    if (!collection) return { ok: false, error: `Framer-collectie ${config.collectionId} niet gevonden in dit project.` }

    // fieldData in Framer-vorm: { [fieldId]: { value } }
    const fm = config.fieldMap as Record<string, string>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fd: Record<string, any> = {}
    if (fm.titel) fd[fm.titel] = { value: blog.titel }
    if (fm.content) fd[fm.content] = { value: blog.content ?? '' }
    if (fm.thumbnail && blog.thumbnail_url) fd[fm.thumbnail] = { value: blog.thumbnail_url }
    if (fm.datum) fd[fm.datum] = { value: new Date().toISOString() }
    if (fm.excerpt && blog.meta_description) fd[fm.excerpt] = { value: blog.meta_description }

    // Idempotent: bestaand item zoeken (op framer_item_id, anders op slug).
    let itemId: string | null = blog.framer_item_id
    if (!itemId) {
      const items = await collection.getItems()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const match = (items as any[]).find((it) => it.slug === blog.slug)
      if (match) itemId = match.id
    }

    // Veiligheidscheck vóór publish: onverwachte openstaande wijzigingen.
    let warning: string | undefined
    try {
      const changed = await framer.getChangedPaths()
      const total = ((changed?.added?.length ?? 0) + (changed?.removed?.length ?? 0) + (changed?.modified?.length ?? 0))
      if (total > 1 && !opts?.confirmOverride) {
        warning = `Er staan ${total} onverwachte Framer-wijzigingen open. Bevestig publicatie om door te gaan.`
        return { ok: false, warning, error: warning }
      }
    } catch { /* getChangedPaths optioneel */ }

    // Item toevoegen of updaten (addItems met bestaande id = merge/update).
    await collection.addItems([itemId ? { id: itemId, slug: blog.slug, fieldData: fd } : { slug: blog.slug, fieldData: fd }])

    // Publiceren + naar productie deployen.
    const pub = await framer.publish()
    const deploymentId = pub?.deployment?.id ?? pub?.deployment ?? pub?.deploymentId
    if (deploymentId) { try { await framer.deploy(deploymentId) } catch { /* deploy best-effort */ } }

    return { ok: true, framerItemId: itemId ?? blog.slug, warning }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Framer-publicatie mislukt' }
  } finally {
    try { await framer?.disconnect() } catch { /* altijd netjes sluiten */ }
  }
}
