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

const REQUIRED_FIELDS = ['titel', 'content', 'slug'] as const

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
      error: 'Framer-publicatie is nog niet geactiveerd (te verifiëren). Configuratie is volledig; activeer de Framer-integratie om live te publiceren.',
    }
  }

  // ── Hier komt de geverifieerde framer-api flow (connect → … → disconnect). ──
  // Bewust nog niet geïmplementeerd tot de package-methoden bevestigd zijn.
  return { ok: false, pending: true, error: 'Framer-integratie geactiveerd maar nog niet geïmplementeerd — bevestig de framer-api methoden.' }
}
