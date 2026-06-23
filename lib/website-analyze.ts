import 'server-only'

// Diepe website-analyse voor bloggeneratie. Scrapet de homepage + de
// belangrijkste subpagina's (diensten, over, FAQ, contact, blog) en distilleert
// een gestructureerde analyse: samenvatting, diensten, SEO-woorden, tone of
// voice, CTA's en FAQ's. Resultaat wordt GECACHED op de blogaccount en niet bij
// elke generatie opnieuw uitgevoerd. Best-effort — faalt nooit door naar de generatie.

export type WebsiteAnalysis = {
  summary: string
  diensten: string[]
  seo_keywords: string[]
  tone_of_voice: string
  ctas: string[]
  faqs: { vraag: string; antwoord?: string }[]
  pages_analyzed: string[]
  generated_at: string
}

const MODEL = () => process.env.BLOG_AI_MODEL || 'claude-sonnet-4-6'
const UA = 'NextGenMediaBot/1.0'

function normalizeUrl(url: string): string {
  let t = url.trim()
  if (!/^https?:\/\//i.test(t)) t = `https://${t}`
  return t.replace(/\/+$/, '')
}

function stripText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? ''
    if (ct && !ct.includes('text/html') && !ct.includes('text/plain')) return null
    return await res.text()
  } catch {
    return null
  }
}

/** Interne links uit de HTML halen, gefilterd op dezelfde host. */
function extractInternalLinks(html: string, base: string): string[] {
  const origin = (() => { try { return new URL(base).origin } catch { return base } })()
  const out = new Set<string>()
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)["']/gi)) {
    let href = m[1].trim()
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue
    try {
      const u = new URL(href, base)
      if (u.origin !== origin) continue
      u.hash = ''; u.search = ''
      href = u.toString().replace(/\/+$/, '')
      if (href && href !== origin) out.add(href)
    } catch { /* skip */ }
  }
  return [...out]
}

/** Kiest de belangrijkste subpagina's op basis van URL-trefwoorden. */
function pickKeyPages(links: string[], max = 5): string[] {
  const priority = [/dienst/i, /service/i, /aanbod/i, /product/i, /over-?ons/i, /about/i, /wie-zijn/i, /faq/i, /veelgestelde/i, /vragen/i, /contact/i, /blog/i, /portfolio/i, /werkwijze/i]
  const scored = links.map((l) => {
    const idx = priority.findIndex((re) => re.test(l))
    return { l, score: idx === -1 ? 999 : idx }
  }).filter((x) => x.score < 999)
  scored.sort((a, b) => a.score - b.score)
  const picked: string[] = []
  const seen = new Set<string>()
  for (const s of scored) { if (!seen.has(s.l)) { seen.add(s.l); picked.push(s.l) } if (picked.length >= max) break }
  return picked
}

function heuristicKeywords(text: string, max = 15): string[] {
  const stop = new Set('de het een van en in op te dat die voor met als zijn aan ook er maar om door over naar bij uit nog wordt worden is was wij we je jij u uw ons onze hun hij zij ze deze dit waar wat hoe wie meer dan niet geen al alle of bij tot tegen zo'.split(' '))
  const freq = new Map<string, number>()
  for (const w of text.toLowerCase().match(/[a-zà-ÿ]{4,}/gi) ?? []) {
    if (stop.has(w)) continue
    freq.set(w, (freq.get(w) ?? 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, max).map(([w]) => w)
}

/** Diepe analyse van een website. Retourneert null als er niets bruikbaars is. */
export async function analyzeWebsiteDeep(url: string | null | undefined): Promise<WebsiteAnalysis | null> {
  if (!url) return null
  const home = normalizeUrl(url)
  const homeHtml = await fetchHtml(home)
  if (!homeHtml) return null

  const links = extractInternalLinks(homeHtml, home)
  const keyPages = pickKeyPages(links, 5)

  const pages: { url: string; html: string }[] = [{ url: home, html: homeHtml }]
  const fetched = await Promise.all(keyPages.map(async (u) => ({ url: u, html: await fetchHtml(u) })))
  for (const f of fetched) if (f.html) pages.push({ url: f.url, html: f.html })

  const pagesAnalyzed = pages.map((p) => p.url)
  const combined = pages.map((p) => `### ${p.url}\n${stripText(p.html).slice(0, 4000)}`).join('\n\n').slice(0, 14000)

  // Headings/CTA-achtige teksten voor de heuristische fallback.
  const homeText = stripText(homeHtml)
  const metaDesc = (homeHtml.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1] ?? '').trim()

  // Probeer een rijke, gestructureerde analyse via Claude. Valt anders terug op heuristiek.
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (apiKey) {
    try {
      const prompt = `Je analyseert de website van een onderneming om er later niet-generieke, SEO-sterke blogs voor te schrijven.
Hieronder staat de tekstinhoud van de homepage en de belangrijkste pagina's.

${combined}

Geef UITSLUITEND geldige JSON terug:
{
  "summary": "2-4 zinnen: wat doet dit bedrijf, voor wie, wat maakt het uniek",
  "diensten": ["concrete dienst/product 1", "..."],
  "seo_keywords": ["relevant zoekwoord", "..."],
  "tone_of_voice": "korte beschrijving van de schrijfstijl/tone (bv. formeel, vlot, technisch, persoonlijk)",
  "ctas": ["call-to-action die het bedrijf gebruikt", "..."],
  "faqs": [{"vraag": "veelgestelde vraag", "antwoord": "kort antwoord indien gevonden"}]
}
Gebruik enkel info die je echt uit de tekst kan afleiden. Laat arrays leeg als je iets niet vindt.`
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL(), max_tokens: 1500, messages: [{ role: 'user', content: prompt }] }),
      })
      const json = await res.json()
      if (res.ok) {
        const text: string = (json?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
        const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
        const arr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 25) : []
        return {
          summary: String(parsed.summary ?? metaDesc ?? '').slice(0, 1000),
          diensten: arr(parsed.diensten),
          seo_keywords: arr(parsed.seo_keywords),
          tone_of_voice: String(parsed.tone_of_voice ?? '').slice(0, 300),
          ctas: arr(parsed.ctas),
          faqs: Array.isArray(parsed.faqs) ? parsed.faqs.slice(0, 15).map((f: { vraag?: string; antwoord?: string }) => ({ vraag: String(f.vraag ?? '').slice(0, 300), antwoord: f.antwoord ? String(f.antwoord).slice(0, 600) : undefined })).filter((f: { vraag: string }) => f.vraag) : [],
          pages_analyzed: pagesAnalyzed,
          generated_at: new Date().toISOString(),
        }
      }
    } catch { /* val terug op heuristiek */ }
  }

  // Heuristische fallback zonder AI.
  return {
    summary: (metaDesc || homeText).slice(0, 600),
    diensten: [],
    seo_keywords: heuristicKeywords(combined),
    tone_of_voice: '',
    ctas: [],
    faqs: [],
    pages_analyzed: pagesAnalyzed,
    generated_at: new Date().toISOString(),
  }
}

/** Zet een analyse om naar prompttekst voor de bloggeneratie. */
export function analysisToPromptText(a: WebsiteAnalysis | null | undefined): string {
  if (!a) return ''
  const parts: string[] = []
  if (a.summary) parts.push(`Over het bedrijf: ${a.summary}`)
  if (a.diensten?.length) parts.push(`Diensten/producten: ${a.diensten.join(', ')}`)
  if (a.seo_keywords?.length) parts.push(`Belangrijke SEO-zoekwoorden: ${a.seo_keywords.join(', ')}`)
  if (a.tone_of_voice) parts.push(`Tone of voice: ${a.tone_of_voice}`)
  if (a.ctas?.length) parts.push(`Gebruikte call-to-actions: ${a.ctas.join(' | ')}`)
  if (a.faqs?.length) parts.push(`Veelgestelde vragen:\n${a.faqs.map((f) => `- ${f.vraag}${f.antwoord ? ` → ${f.antwoord}` : ''}`).join('\n')}`)
  return parts.join('\n')
}

/** Compatibiliteit: platte-tekst-analyse (gebruikt de diepe analyse onder de motorkap). */
export async function analyzeWebsite(url: string | null | undefined): Promise<string> {
  const a = await analyzeWebsiteDeep(url)
  return analysisToPromptText(a)
}
