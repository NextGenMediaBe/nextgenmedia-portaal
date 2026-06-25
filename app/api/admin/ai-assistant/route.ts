import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { buildAiSnapshot } from '@/lib/ai-context'

export const maxDuration = 60

const MODEL = () => process.env.BLOG_AI_MODEL || 'claude-sonnet-4-6'

// NextGen AI — read-only assistent. Beantwoordt vragen over het platform en
// STELT acties VOOR met deep-links, maar voert NOOIT zelf iets uit.
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
    if (roleData?.role !== 'admin') return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt).' }, { status: 400 })

    const { messages } = await req.json() as { messages: { role: 'user' | 'assistant'; content: string }[] }
    if (!Array.isArray(messages) || messages.length === 0) return NextResponse.json({ error: 'Geen vraag' }, { status: 400 })

    const snapshot = await buildAiSnapshot()
    // Compacte clientregels (token-zuinig).
    const clientLines = snapshot.clients.map((c) =>
      `${c.name} | contracten:${c.contracts} getekend:${c.signed} | prognose:${c.forecast ? 'ja' : 'nee'} | framer:${c.framer ? 'ja' : 'nee'} | diensten:${c.services.join(',') || '-'}`
    ).join('\n')

    const system = `Je bent "NextGen AI", de assistent in het interne agency-platform van NextGenMedia (admin).
Je hebt READ-ONLY toegang tot onderstaande momentopname. Je voert NOOIT zelf acties uit.
Wanneer de gebruiker iets wil aanmaken/versturen, geef je een kort voorstel + de juiste deep-link als actie; de mens bevestigt door te klikken.

Wees maximaal behulpzaam. Weiger NOOIT normale vragen of aanmaak-/zoek-/samenvat-verzoeken (klant, factuur, contract, blog, prognose, taak). Bij een aanmaakvraag: geef een kort voorstel + de juiste deep-link als actie (de mens bevestigt door te klikken). Enkel destructieve acties (verwijderen/annuleren/overschrijven) weiger je en verwijs je naar de module met expliciete bevestiging.

Antwoord altijd in het Nederlands, kort en concreet. Geef UITSLUITEND geldige JSON terug:
{"answer": "<bondig antwoord>", "actions": [{"label": "<knoptekst>", "href": "<deep-link>"}]}
"actions" is optioneel (leeg laten als er geen actie nodig is).

Geldige deep-links (gebruik enkel deze patronen):
- /admin/clients/new (nieuwe klant)
- /admin/clients/<id> (klantdetail/hub)
- /admin/contracts/new (nieuw contract)
- /admin/contracts (contracten)
- /admin/invoices (facturen)
- /admin/revenue/omzet (prognose)
- /admin/blog-calendar (blogs)

Momentopname (${snapshot.generatedAt}):
Totaal klanten: ${snapshot.totals.clients} | facturen te versturen: ${snapshot.totals.invoicesToSend} | contracten op te volgen: ${snapshot.totals.contractsToFollowUp}
Klanten:
${clientLines}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL(), max_tokens: 1500, system,
        messages: messages.slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 4000) })),
      }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return NextResponse.json({ error: `AI-fout: ${json?.error?.message || res.status}` }, { status: 400 })

    const text: string = (json?.content ?? []).map((b: { text?: string }) => b.text ?? '').join('')
    const start = text.indexOf('{'), end = text.lastIndexOf('}')
    let parsed: { answer?: string; actions?: { label: string; href: string }[] } = {}
    try { parsed = JSON.parse(text.slice(start, end + 1)) } catch { parsed = { answer: text } }

    // Saneer acties: enkel interne deep-links toelaten.
    const actions = (parsed.actions ?? [])
      .filter((a) => a && typeof a.href === 'string' && a.href.startsWith('/admin/'))
      .slice(0, 4)
      .map((a) => ({ label: String(a.label || 'Openen').slice(0, 60), href: a.href }))

    return NextResponse.json({ answer: parsed.answer || 'Geen antwoord.', actions })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
