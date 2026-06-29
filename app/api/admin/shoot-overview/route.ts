import { NextRequest, NextResponse } from 'next/server'
import { createClient, createAdminSupabaseClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export const maxDuration = 60
const MODEL = () => process.env.BLOG_AI_MODEL || 'claude-sonnet-4-6'

async function requireAdminUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase.from('user_roles').select('role').eq('user_id', user.id).maybeSingle()
  return data?.role === 'admin' ? user : null
}

const monthStart = (m: string) => `${m}-01`
const monthEnd = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10) }

// POST { client_id, months[] }            → AI-filmoverzicht (markdown) genereren
// POST { client_id, month, action:'flag_need' } → behoefte aan content shoot markeren
export async function POST(req: NextRequest) {
  try {
    const user = await requireAdminUser()
    if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
    const admin = createAdminSupabaseClient()
    const b = await req.json()
    const clientId = b.client_id as string
    if (!clientId) return NextResponse.json({ error: 'client_id vereist' }, { status: 400 })

    // ── Behoefte aan content shoot markeren ────────────────────────────────────
    if (b.action === 'flag_need') {
      const month = String(b.month || '').slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Maand vereist' }, { status: 400 })
      const { error } = await admin.from('shoot_briefings').insert({
        client_id: clientId, shoot_date: null, briefing: `Behoefte aan content shoot aangeduid voor ${month} — nog in te plannen.`, created_by: user.id,
      })
      if (error) throw new Error(error.message)
      try { revalidatePath('/admin/services/social-media') } catch { }
      return NextResponse.json({ ok: true })
    }

    // ── Filmoverzicht genereren ────────────────────────────────────────────────
    const months: string[] = Array.isArray(b.months) ? b.months.filter((m: unknown) => typeof m === 'string' && /^\d{4}-\d{2}$/.test(m)) : []
    if (months.length === 0) return NextResponse.json({ error: 'Selecteer minstens één maand' }, { status: 400 })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'AI niet geconfigureerd (ANTHROPIC_API_KEY ontbreekt).' }, { status: 400 })

    const sorted = [...months].sort()
    const from = monthStart(sorted[0]); const to = monthEnd(sorted[sorted.length - 1])

    const [{ data: client }, { data: itemsRaw }, { data: shootsRaw }] = await Promise.all([
      admin.from('clients').select('company_name').eq('id', clientId).maybeSingle(),
      admin.from('social_content_items').select('*').eq('client_id', clientId).gte('planned_date', from).lte('planned_date', to).order('planned_date', { ascending: true }),
      admin.from('shoot_briefings').select('*').eq('client_id', clientId).gte('shoot_date', from).lte('shoot_date', to),
    ])
    const monthSet = new Set(sorted)
    const items = (itemsRaw ?? []).filter((i) => monthSet.has(String(i.planned_date).slice(0, 7)))
    const shoots = shootsRaw ?? []

    if (items.length === 0) return NextResponse.json({ error: 'Geen scripts/content gevonden voor deze klant in de gekozen maand(en).', hasShoot: shoots.length > 0, scriptCount: 0 }, { status: 400 })

    const scriptLines = items.map((i, n) => {
      const plats = Array.isArray(i.platforms) && i.platforms.length ? i.platforms.join(', ') : (i.platform ?? '')
      return `### ${n + 1}. ${i.title || 'Naamloos'} (${i.content_type || 'post'}${plats ? ` · ${plats}` : ''} · ${String(i.planned_date).slice(0, 10)})
Script: ${i.script || '(geen script)'}
Caption: ${i.caption || '-'}
Media-notities: ${i.media_notes || '-'}`
    }).join('\n\n')
    const shootLines = shoots.map((s) => `- ${s.shoot_date ? String(s.shoot_date).slice(0, 10) : 'datum n.t.b.'}${s.location ? ` @ ${s.location}` : ''}: ${s.briefing || '-'}`).join('\n') || 'Nog geen content shoot gepland.'

    const prompt = `Je bent een productieassistent voor videocontent. Maak een helder, downloadbaar FILMOVERZICHT voor de content shoot van klant "${client?.company_name ?? ''}" voor de maand(en): ${sorted.join(', ')}.

Gebruik de onderstaande scripts + shootbrief. Geef het overzicht in nette Markdown met PER SCRIPT:
- **Titel + platform + geplande datum**
- **Wat moet er gefilmd worden** (concrete shotlist, opnames, scènes)
- **B-rolls** (suggesties voor ondersteunende beelden)
- **Exacte teksten / vragen** die de klant moet inspreken of beantwoorden (woordelijk, klaar om voor te lezen)

Sluit af met een **algemene checklist** (locatie, materiaal, props, outfits, volgorde van de dag).
Wees concreet en praktisch zodat het team meteen kan filmen. Geen inleiding, start direct met het overzicht.

## Shootbrief
${shootLines}

## Scripts (${items.length})
${scriptLines}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL(), max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) return NextResponse.json({ error: `AI-fout: ${json?.error?.message || res.status}` }, { status: 400 })
    const overview: string = (json?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('').trim()

    return NextResponse.json({ overview, scriptCount: items.length, hasShoot: shoots.length > 0, clientName: client?.company_name ?? '' })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fout' }, { status: 400 })
  }
}
