import 'server-only'

// Bloggeneratie via Anthropic Claude (REST, geen extra dependency).
// Model configureerbaar via BLOG_AI_MODEL (default claude-sonnet-4-6).
// Zonder ANTHROPIC_API_KEY valt het terug op een eenvoudige sjabloon-draft,
// zodat de flow ook zonder AI werkt (admin werkt af in review).

export type BlogMemory = {
  topics: string[]
  keywords: string[]
  angles: string[]
  ctas: string[]
}

export type BlogKnowledge = {
  bedrijfsinformatie?: string
  doelgroep?: string
  tone_of_voice?: string
  belangrijke_termen?: string[]
  verboden_woorden?: string[]
  faqs?: { vraag: string; antwoord?: string }[]
  cases?: string[]
}

export type BlogInput = {
  clientName: string
  website?: string | null
  niche?: string | null
  brandContext?: string | null
  websiteContent?: string | null   // gestructureerde website-analyse als prompttekst
  recentTitles?: string[]
  memory?: BlogMemory | null        // reeds gebruikte onderwerpen/keywords/invalshoeken/CTA's
  knowledge?: BlogKnowledge | null  // kennisbank — HOOGSTE prioriteit
}

export type GeneratedBlog = {
  titel: string
  slug: string
  content: string
  meta_title: string
  meta_description: string
  thumbnail_url: string | null
  // Metadata voor het blog-geheugen (herhaling vermijden) + interne links
  topic: string
  keywords: string[]
  angle: string
  cta: string
  internal_link_suggestions: string[]
  tags: string[]
  word_count: number
}

/** Bouwt het kennisbank-blok (hoogste prioriteit) voor de prompt. */
function knowledgeBlock(k?: BlogKnowledge | null): string {
  if (!k) return ''
  const parts: string[] = []
  if (k.bedrijfsinformatie) parts.push(`Bedrijfsinformatie: ${k.bedrijfsinformatie}`)
  if (k.doelgroep) parts.push(`Doelgroep: ${k.doelgroep}`)
  if (k.tone_of_voice) parts.push(`Tone of voice (verplicht volgen): ${k.tone_of_voice}`)
  if (k.belangrijke_termen?.length) parts.push(`Gebruik deze belangrijke termen: ${k.belangrijke_termen.join(', ')}`)
  if (k.verboden_woorden?.length) parts.push(`VERBODEN woorden (nooit gebruiken): ${k.verboden_woorden.join(', ')}`)
  if (k.cases?.length) parts.push(`Concrete cases/voorbeelden om naar te verwijzen:\n${k.cases.map((c) => `- ${c}`).join('\n')}`)
  if (k.faqs?.length) parts.push(`Veelgestelde vragen:\n${k.faqs.map((f) => `- ${f.vraag}${f.antwoord ? ` → ${f.antwoord}` : ''}`).join('\n')}`)
  if (parts.length === 0) return ''
  return `KENNISBANK (HOOGSTE PRIORITEIT — volg dit strikt, het overschrijft alle andere bronnen):\n${parts.join('\n')}\n`
}

export function slugify(s: string): string {
  return (s || 'blog')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'blog'
}

const MODEL = () => process.env.BLOG_AI_MODEL || 'claude-sonnet-4-6'

export async function generateBlog(input: BlogInput): Promise<GeneratedBlog> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return templateDraft(input)

  const avoid = (input.recentTitles ?? []).slice(0, 15).map((t) => `- ${t}`).join('\n')
  const mem = input.memory
  const memBlock = mem && (mem.topics?.length || mem.keywords?.length || mem.angles?.length || mem.ctas?.length)
    ? `Dit is al eerder voor dit bedrijf behandeld — VERMIJD herhaling en kies bewust een nieuw onderwerp, nieuwe invalshoek en andere CTA:
- Reeds gebruikte onderwerpen: ${(mem.topics ?? []).slice(0, 30).join(', ') || '(geen)'}
- Reeds gebruikte keywords: ${(mem.keywords ?? []).slice(0, 40).join(', ') || '(geen)'}
- Reeds gebruikte invalshoeken: ${(mem.angles ?? []).slice(0, 20).join(', ') || '(geen)'}
- Reeds gebruikte CTA's: ${(mem.ctas ?? []).slice(0, 20).join(' | ') || '(geen)'}
`
    : ''

  const prompt = `Je bent een ervaren Nederlandstalige (Vlaamse) SEO-contentmarketeer voor het bedrijf "${input.clientName}".
Schrijf één diepgaande, professionele, SEO-geoptimaliseerde blogpost.

${knowledgeBlock(input.knowledge)}
Bedrijf: ${input.clientName}
Website: ${input.website || '—'}
Niche: ${input.niche || '—'}
Blog briefing / merkcontext: ${input.brandContext || '—'}

${input.websiteContent ? `Website-analyse (gebruik dit voor concrete, niet-generieke content — diensten, doelgroep, tone of voice, zoekwoorden):\n${input.websiteContent}\n` : ''}
${memBlock}
Vermijd herhaling van deze recente titels:
${avoid || '- (geen)'}

KWALITEITSEISEN (verplicht):
- Minimaal 1200 woorden, vlot leesbaar Nederlands (Vlaams).
- SEO-geoptimaliseerd: verwerk relevante zoekwoorden natuurlijk in titel, tussenkoppen en tekst.
- Duidelijke structuur met meerdere tussenkoppen (## en ###).
- Minstens één concrete, praktische voorbeeld- of casussectie.
- Een duidelijke call-to-action op het einde, passend bij het bedrijf.
- Schrijf specifiek en concreet op basis van bovenstaande info — VERMIJD generieke AI-vultekst, clichés en holle zinnen.

Geef UITSLUITEND geldige JSON terug met deze velden:
{
  "titel": "pakkende, SEO-sterke titel",
  "content": "volledige blog in Markdown met ## tussenkoppen, praktische voorbeelden en een afsluitende CTA (minimaal 1200 woorden)",
  "meta_title": "max 60 tekens",
  "meta_description": "max 155 tekens, wervend",
  "topic": "korte omschrijving van het hoofdonderwerp",
  "keywords": ["belangrijkste zoekwoord", "..."],
  "angle": "de gekozen invalshoek in enkele woorden",
  "cta": "de call-to-action die je gebruikt hebt",
  "internal_link_suggestions": ["suggestie voor interne link (anchor of paginathema)", "..."],
  "tags": ["1 tot 4 thematische tags, bv. SEO, Branding, HR, Vastgoed, Burn-out, Social Media"]
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 6000, messages: [{ role: 'user', content: prompt }] }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error?.message || `AI-fout (${res.status})`)
    const text: string = (json?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const titel = String(parsed.titel || 'Nieuwe blog').trim()
    const content = String(parsed.content || '')
    const arr = (v: unknown): string[] => Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean).slice(0, 20) : []
    return {
      titel,
      slug: slugify(titel),
      content,
      meta_title: String(parsed.meta_title || titel).slice(0, 70),
      meta_description: String(parsed.meta_description || '').slice(0, 170),
      thumbnail_url: null,
      topic: String(parsed.topic || titel).slice(0, 200),
      keywords: arr(parsed.keywords),
      angle: String(parsed.angle || '').slice(0, 200),
      cta: String(parsed.cta || '').slice(0, 300),
      internal_link_suggestions: arr(parsed.internal_link_suggestions),
      tags: arr(parsed.tags).slice(0, 6),
      word_count: content.trim().split(/\s+/).filter(Boolean).length,
    }
  } catch {
    // AI faalde → bruikbare sjabloon-draft zodat de cyclus niet vastloopt.
    return templateDraft(input)
  }
}

function templateDraft(input: BlogInput): GeneratedBlog {
  const niche = input.niche || 'onze sector'
  const titel = `Inzichten over ${niche} — ${input.clientName}`
  const content = `# ${titel}\n\n_Concept — nog af te werken in review._\n\nDit is een automatisch voorbereide blogdraft voor **${input.clientName}**.\n\n## Inleiding\nSchrijf hier een sterke opening over ${niche}.\n\n## Kern\n${input.brandContext || 'Voeg hier de kernboodschap en merkcontext toe.'}\n\n## Conclusie\nSluit af met een duidelijke call-to-action.`
  return {
    titel,
    slug: slugify(titel) + '-' + Date.now().toString(36).slice(-4),
    content,
    meta_title: titel.slice(0, 70),
    meta_description: `Blog van ${input.clientName} over ${niche}.`.slice(0, 170),
    thumbnail_url: null,
    topic: niche,
    keywords: [],
    angle: '',
    cta: '',
    internal_link_suggestions: [],
    tags: [],
    word_count: content.trim().split(/\s+/).filter(Boolean).length,
  }
}

/**
 * Stelt ontbrekende blogonderwerpen voor (content gaps) op basis van de reeds
 * behandelde titels/keywords en de website-analyse. Best-effort — lege lijst bij fout.
 */
export async function suggestContentGaps(input: { clientName: string; websiteContent?: string | null; existingTitles: string[]; usedKeywords: string[] }): Promise<string[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return []
  try {
    const prompt = `Je bent SEO-strateeg voor "${input.clientName}".
${input.websiteContent ? `Website-analyse:\n${input.websiteContent}\n` : ''}
Reeds behandelde blogtitels:
${input.existingTitles.slice(0, 40).map((t) => `- ${t}`).join('\n') || '- (geen)'}

Reeds gebruikte zoekwoorden: ${input.usedKeywords.slice(0, 40).join(', ') || '(geen)'}

Geef UITSLUITEND geldige JSON: {"gaps": ["ontbrekend blogonderwerp 1", "..."]}
Stel 5-10 concrete, relevante onderwerpen voor die nog NIET behandeld zijn en die SEO-waarde hebben.`
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    })
    const json = await res.json()
    if (!res.ok) return []
    const text: string = (json?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    return Array.isArray(parsed.gaps) ? parsed.gaps.map((x: unknown) => String(x)).filter(Boolean).slice(0, 12) : []
  } catch {
    return []
  }
}
