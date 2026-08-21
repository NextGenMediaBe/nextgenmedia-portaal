import 'server-only'
import { readZip } from '@/lib/zip'

/**
 * Minimale .xlsx-lezer — ZONDER externe bibliotheek.
 *
 * Waarom zelf geschreven: de gangbare pakketten (xlsx, exceljs) brengen elk
 * meerdere bekende kwetsbaarheden mee. Een xlsx is in de kern een ZIP met XML,
 * en Node kan zelf uitpakken (zlib). Voor "exporteer je lijst en importeer hem"
 * is dat ruim voldoende, zonder de aanvalsoppervlakte te vergroten.
 *
 * We lezen alleen wat we nodig hebben: het eerste werkblad als tekstwaarden.
 * Het uitpakken zelf staat in lib/zip.ts, gedeeld met de bestekdocumenten.
 * Opmaak, formules, afbeeldingen en meerdere tabbladen negeren we bewust.
 */

export type Sheet = { headers: string[]; rows: string[][] }

// ── XML-hulpjes ──────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
}

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => XML_ENTITIES[m] ?? m)
}

/** Kolomletters → index. 'A' = 0, 'Z' = 25, 'AA' = 26. */
function colIndex(ref: string): number {
  const letters = ref.replace(/\d+/g, '')
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** De gedeelde tekstentabel: cellen met t="s" verwijzen hiernaar met een index. */
function readSharedStrings(xml: string): string[] {
  const out: string[] = []
  // Eén <si> kan meerdere <t>-stukken hebben (bij gemengde opmaak); die horen
  // aan elkaar geplakt te worden tot één waarde.
  for (const m of xml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const parts = [...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1]))
    out.push(parts.join(''))
  }
  return out
}

// ── Werkblad lezen ───────────────────────────────────────────────────────────

function readSheet(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []

  for (const rowMatch of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? ''
      const inner = c[2] ?? ''
      const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1]
      const type = /t="([^"]+)"/.exec(attrs)?.[1] ?? 'n'

      let value = ''
      if (type === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
        value = shared[idx] ?? ''
      } else if (type === 'inlineStr') {
        value = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join('')
      } else {
        value = decodeXml(/<v>([\s\S]*?)<\/v>/.exec(inner)?.[1] ?? '')
        if (type === 'b') value = value === '1' ? 'waar' : value === '0' ? 'onwaar' : value
      }

      // Lege cellen worden in xlsx overgeslagen; met de celverwijzing (r="C2")
      // zetten we de waarde alsnog in de juiste kolom.
      const at = ref ? colIndex(ref) : cells.length
      while (cells.length < at) cells.push('')
      cells[at] = value.trim()
    }
    rows.push(cells)
  }
  return rows
}

/** Eerste werkblad van een .xlsx als koppen + rijen. */
export function parseXlsx(buf: Buffer): Sheet {
  const files = readZip(buf)

  const sharedXml = files.get('xl/sharedStrings.xml')
  const shared = sharedXml ? readSharedStrings(sharedXml.toString('utf8')) : []

  // Het eerste werkblad; namen kunnen variëren, dus we zoeken breed.
  const sheetName = [...files.keys()]
    .filter((n) => /^xl\/worksheets\/sheet\d*\.xml$/.test(n))
    .sort()[0]
  if (!sheetName) throw new Error('Geen werkblad gevonden in dit Excel-bestand.')

  const rows = readSheet(files.get(sheetName)!.toString('utf8'), shared)
  const filled = rows.filter((r) => r.some((v) => v !== ''))
  if (filled.length === 0) return { headers: [], rows: [] }

  const headers = filled[0].map((h) => h.trim())
  return {
    headers,
    rows: filled.slice(1).map((r) => headers.map((_, i) => (r[i] ?? '').trim())),
  }
}
