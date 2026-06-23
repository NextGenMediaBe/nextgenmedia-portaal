import 'server-only'

// Lichte website-analyse voor bloggeneratie: haalt de pagina op en distilleert
// leesbare tekst (titel, meta description, headings, alineas). Best-effort —
// faalt nooit door naar de generatie.

export async function analyzeWebsite(url: string | null | undefined): Promise<string> {
  if (!url) return ''
  let target = url.trim()
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`
  try {
    const res = await fetch(target, { headers: { 'User-Agent': 'NextGenMediaBot/1.0' }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return ''
    const html = await res.text()
    const pick = (re: RegExp) => (html.match(re)?.[1] ?? '').replace(/\s+/g, ' ').trim()
    const title = pick(/<title[^>]*>([\s\S]*?)<\/title>/i)
    const metaDesc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)
    // Headings + paragrafen
    const blocks: string[] = []
    for (const m of html.matchAll(/<(h1|h2|h3|p)[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const txt = m[2].replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim()
      if (txt.length > 20) blocks.push(txt)
      if (blocks.join(' ').length > 3000) break
    }
    const parts = [title && `Titel: ${title}`, metaDesc && `Beschrijving: ${metaDesc}`, blocks.length && `Inhoud:\n${blocks.slice(0, 25).join('\n')}`].filter(Boolean)
    return parts.join('\n\n').slice(0, 4000)
  } catch {
    return ''
  }
}
