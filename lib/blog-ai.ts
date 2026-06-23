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

export type BlogInput = {
  clientName: string
  website?: string | null
  niche?: string | null
  brandContext?: string | null
  websiteContent?: string | null   // gestructureerde website-analyse als prompttekst
  recentTitles?: string[]
  memory?: BlogMemory | null        // reeds gebruikte onderwerpen/keywords/invalshoeken/CTA's
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
  word_count: number
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
  "internal_link_suggestions": ["suggestie voor interne link (anchor of paginathema)", "..."]
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
    word_count: content.trim().split(/\s+/).filter(Boolean).length,
  }
}
