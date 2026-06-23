import 'server-only'

// Bloggeneratie via Anthropic Claude (REST, geen extra dependency).
// Model configureerbaar via BLOG_AI_MODEL (default claude-sonnet-4-6).
// Zonder ANTHROPIC_API_KEY valt het terug op een eenvoudige sjabloon-draft,
// zodat de flow ook zonder AI werkt (admin werkt af in review).

export type BlogInput = {
  clientName: string
  website?: string | null
  niche?: string | null
  brandContext?: string | null
  websiteContent?: string | null
  recentTitles?: string[]
}

export type GeneratedBlog = {
  titel: string
  slug: string
  content: string
  meta_title: string
  meta_description: string
  thumbnail_url: string | null
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

  const avoid = (input.recentTitles ?? []).slice(0, 10).map((t) => `- ${t}`).join('\n')
  const prompt = `Je bent een ervaren Nederlandstalige (Vlaamse) contentmarketeer voor het bedrijf "${input.clientName}".
Schrijf één SEO-vriendelijke blogpost.

Bedrijf: ${input.clientName}
Website: ${input.website || '—'}
Niche: ${input.niche || '—'}
Blog briefing / merkcontext: ${input.brandContext || '—'}

${input.websiteContent ? `Relevante info van de website (gebruik dit voor concrete, niet-generieke content):\n${input.websiteContent}\n` : ''}
Vermijd herhaling van deze recente titels:
${avoid || '- (geen)'}

Schrijf specifiek en concreet op basis van bovenstaande info — vermijd generieke vultekst.

Geef UITSLUITEND geldige JSON terug met deze velden:
{
  "titel": "pakkende titel",
  "content": "volledige blog in Markdown, met koppen en alinea's, 500-800 woorden",
  "meta_title": "max 60 tekens",
  "meta_description": "max 155 tekens"
}`

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json?.error?.message || `AI-fout (${res.status})`)
    const text: string = (json?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const titel = String(parsed.titel || 'Nieuwe blog').trim()
    return {
      titel,
      slug: slugify(titel),
      content: String(parsed.content || ''),
      meta_title: String(parsed.meta_title || titel).slice(0, 70),
      meta_description: String(parsed.meta_description || '').slice(0, 170),
      thumbnail_url: null,
    }
  } catch {
    // AI faalde → bruikbare sjabloon-draft zodat de cyclus niet vastloopt.
    return templateDraft(input)
  }
}

function templateDraft(input: BlogInput): GeneratedBlog {
  const niche = input.niche || 'onze sector'
  const titel = `Inzichten over ${niche} — ${input.clientName}`
  return {
    titel,
    slug: slugify(titel) + '-' + Date.now().toString(36).slice(-4),
    content: `# ${titel}\n\n_Concept — nog af te werken in review._\n\nDit is een automatisch voorbereide blogdraft voor **${input.clientName}**.\n\n## Inleiding\nSchrijf hier een sterke opening over ${niche}.\n\n## Kern\n${input.brandContext || 'Voeg hier de kernboodschap en merkcontext toe.'}\n\n## Conclusie\nSluit af met een duidelijke call-to-action.`,
    meta_title: titel.slice(0, 70),
    meta_description: `Blog van ${input.clientName} over ${niche}.`.slice(0, 170),
    thumbnail_url: null,
  }
}
