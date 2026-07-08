import { NextRequest, NextResponse } from 'next/server'
import { createAdminSupabaseClient, requireAdmin } from '@/lib/supabase/server'
import { metricoolConfigured, fetchAllPostStats, summarizeStats, engagementOf, type PostStat } from '@/lib/metricool'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const MODEL = () => process.env.BLOG_AI_MODEL || 'claude-sonnet-4-6'

const WEEK = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag']
const TYPE_NL: Record<string, string> = { reel: 'Reels', post: 'Posts', story: 'Stories', video: "Video's", tweet: 'Tweets' }
const fmt = (n: number | undefined) => (n == null || !isFinite(n) ? '0' : String(Math.round(n)))

// POST { clientId, days } → AI-samenvatting (markdown) van wat werkt/niet werkt.
// ADMIN-ONLY, read-only analyse. Nooit in het klantportaal.
export async function POST(req: NextRequest) {
  try {
    if (!(await requireAdmin())) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    if (!metricoolConfigured()) return NextResponse.json({ error: 'Metricool niet geconfigureerd' }, { status: 400 })

    const { clientId, days: daysRaw } = await req.json()
    if (!clientId) return NextResponse.json({ error: 'clientId vereist' }, { status: 400 })

    const admin = createAdminSupabaseClient()
    const { data: client } = await admin
      .from('clients').select('id, company_name, metricool_blog_id').eq('id', clientId).maybeSingle()
    if (!client) return NextResponse.json({ error: 'Klant niet gevonden' }, { status: 404 })
    if (!client.metricool_blog_id) return NextResponse.json({ error: 'Klant niet gekoppeld aan Metricool' }, { status: 400 })

    const days = Math.min(365, Math.max(7, Number(daysRaw) || 90))
    const now = new Date()
    const end = now.toISOString().slice(0, 10)
    const start = new Date(now.getTime() - days * 86400_000).toISOString().slice(0, 10)

    const posts = await fetchAllPostStats(client.metricool_blog_id as string, start, end)
    const summary = summarizeStats(posts)
    if (summary.totalPosts === 0) {
      return NextResponse.json({ error: 'Onvoldoende data: geen gepubliceerde posts met cijfers in deze periode.' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt).' }, { status: 400 })

    // ── Compacte datacontext voor het model ──────────────────────────────────
    const formatLines = summary.byType.map((f) => {
      const eng = f.avg.engagement ?? ((f.avg.likes ?? 0) + (f.avg.comments ?? 0) + (f.avg.shares ?? 0) + (f.avg.saved ?? 0))
      return `- ${TYPE_NL[f.type] ?? f.type}: ${f.count} posts | gem. engagement ${fmt(eng)} | gem. weergaven ${fmt(f.avg.views)} | gem. likes ${fmt(f.avg.likes)} | gem. reacties ${fmt(f.avg.comments)} | gem. shares ${fmt(f.avg.shares)}`
    }).join('\n')

    const cells: Array<{ d: number; h: number; avg: number; n: number }> = []
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (summary.heatmapCount[d][h] > 0) cells.push({ d, h, avg: summary.heatmap[d][h], n: summary.heatmapCount[d][h] })
    cells.sort((a, b) => b.avg - a.avg)
    const bestTimes = cells.slice(0, 6).map((c) => `- ${WEEK[c.d]} ${String(c.h).padStart(2, '0')}:00u — gem. engagement ${fmt(c.avg)} (${c.n} posts)`).join('\n') || '- (te weinig data)'

    const topPosts = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a)).slice(0, 5).map((p: PostStat, i) => {
      const t = (p.text || '').replace(/\s+/g, ' ').slice(0, 90)
      return `${i + 1}. [${p.network}/${p.type}] ${p.datetime?.slice(0, 16) ?? ''} — engagement ${fmt(engagementOf(p))} (👁${fmt(p.metrics.views)} ❤${fmt(p.metrics.likes)} 💬${fmt(p.metrics.comments)}) — "${t}"`
    }).join('\n')

    const overall = summary.overall
    const dataBlock = `Klant: ${client.company_name}
Periode: laatste ${days} dagen (${start} t/m ${end})
Totaal gepubliceerde posts: ${summary.totalPosts}
Totalen: weergaven ${fmt(overall.views)}, likes ${fmt(overall.likes)}, reacties ${fmt(overall.comments)}, shares ${fmt(overall.shares)}, bereik ${fmt(overall.reach)}

Per formaat (gemiddelden per post):
${formatLines}

Beste posttijden (hoogste gem. engagement, dag+uur):
${bestTimes}

Topposts:
${topPosts}`

    const prompt = `Je bent een ervaren social-media strateeg voor een contentbureau. Analyseer onderstaande PRESTATIEDATA van één klant en schrijf een beknopte, concrete samenvatting in het Nederlands, uitsluitend gebaseerd op deze cijfers (verzin niks).

Structureer met deze Markdown-koppen:
## Wat werkt
## Wat werkt niet
## Beste formaten (reels/posts/stories)
## Beste posttijden
## Aanbevelingen voor de komende 3 maanden

Regels:
- Wees concreet en noem cijfers uit de data (bv. "reels halen gemiddeld X engagement vs Y voor posts").
- Bij posttijden: geef 2-3 concrete dag+uur-aanbevelingen.
- Aanbevelingen = praktisch en direct toepasbaar (welk formaat meer/minder, wanneer posten, welk type content).
- Kort en bruikbaar voor een klantmeeting. Geen inleiding, start direct met de eerste kop.

DATA:
${dataBlock}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 1600, messages: [{ role: 'user', content: prompt }] }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return NextResponse.json({ error: `AI-fout: ${json?.error?.message || res.status}` }, { status: 400 })
    const markdown: string = (json?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').trim()

    return NextResponse.json({ markdown, clientName: client.company_name, days, totalPosts: summary.totalPosts })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
