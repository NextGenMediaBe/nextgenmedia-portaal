'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, Clapperboard, Loader2, Download, Printer, AlertTriangle, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const MONTHS_NL = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

// Lichte markdown → HTML (headings, bold, lijsten) voor een nette, printbare weergave.
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines = md.split('\n')
  let html = ''; let inList = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    const closeList = () => { if (inList) { html += '</ul>'; inList = false } }
    if (/^###\s+/.test(line)) { closeList(); html += `<h3>${esc(line.replace(/^###\s+/, ''))}</h3>` }
    else if (/^##\s+/.test(line)) { closeList(); html += `<h2>${esc(line.replace(/^##\s+/, ''))}</h2>` }
    else if (/^#\s+/.test(line)) { closeList(); html += `<h1>${esc(line.replace(/^#\s+/, ''))}</h1>` }
    else if (/^[-*]\s+/.test(line)) { if (!inList) { html += '<ul>'; inList = true } html += `<li>${esc(line.replace(/^[-*]\s+/, ''))}</li>` }
    else if (line === '') { closeList() }
    else { closeList(); html += `<p>${esc(line)}</p>` }
  }
  if (inList) html += '</ul>'
  return html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export default function ShootOverviewPage() {
  const [clients, setClients] = useState<{ id: string; company_name: string }[]>([])
  const [clientId, setClientId] = useState('')
  const [months, setMonths] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [overview, setOverview] = useState<string | null>(null)
  const [meta, setMeta] = useState<{ scriptCount: number; hasShoot: boolean; clientName: string } | null>(null)

  useEffect(() => {
    fetch('/api/admin/clients-list', { cache: 'no-store' }).then((r) => r.json()).then((j) => setClients(j.clients ?? [])).catch(() => {})
  }, [])

  // Maandopties: 2 maanden terug t/m 9 maanden vooruit.
  const monthOptions = useMemo(() => {
    const out: { value: string; label: string }[] = []
    const now = new Date()
    for (let i = -2; i <= 9; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      out.push({ value, label: `${MONTHS_NL[d.getMonth()]} ${d.getFullYear()}` })
    }
    return out
  }, [])

  const toggleMonth = (m: string) => setMonths((p) => p.includes(m) ? p.filter((x) => x !== m) : [...p, m])

  const generate = async () => {
    if (!clientId) { toast.error('Kies een klant'); return }
    if (months.length === 0) { toast.error('Kies minstens één maand'); return }
    setLoading(true); setOverview(null); setMeta(null)
    try {
      const res = await fetch('/api/admin/shoot-overview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, months }),
      })
      const j = await res.json()
      if (!res.ok) { toast.error(j.error || 'Mislukt'); if (j.hasShoot === false) setMeta({ scriptCount: 0, hasShoot: false, clientName: '' }); return }
      setOverview(j.overview); setMeta({ scriptCount: j.scriptCount, hasShoot: j.hasShoot, clientName: j.clientName })
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setLoading(false) }
  }

  const flagNeed = async () => {
    if (!clientId || months.length === 0) { toast.error('Kies klant + maand'); return }
    try {
      const res = await fetch('/api/admin/shoot-overview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, month: months[0], action: 'flag_need' }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Behoefte aan content shoot gemarkeerd.')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Mislukt') }
  }

  const download = () => {
    if (!overview) return
    const name = (meta?.clientName || 'klant').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    const blob = new Blob([overview], { type: 'text/markdown;charset=utf-8' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `shootoverzicht-${name}-${months.sort().join('_')}.md`; a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/admin/services/social-media" className="btn-secondary px-2"><ChevronLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Clapperboard className="h-5 w-5" />Content shoot — filmoverzicht (AI)</h1>
          <p className="text-sm text-gray-500 mt-0.5">Kies klant + maand(en) → AI bundelt scripts + shootbrief tot één downloadbaar overzicht (shotlist, B-rolls, exacte teksten).</p>
        </div>
      </div>

      <div className="card-base space-y-4 no-print">
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Klant</label>
            <select className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg" value={clientId} onChange={(e) => setClientId(e.target.value)}>
              <option value="">— Kies klant —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Maanden</label>
          <div className="flex flex-wrap gap-1.5">
            {monthOptions.map((m) => (
              <button key={m.value} onClick={() => toggleMonth(m.value)}
                className={`text-xs px-2.5 py-1 rounded-lg border ${months.includes(m.value) ? 'border-[#fff848] bg-[#fff848]/10 font-medium' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={generate} disabled={loading} className="btn-primary">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Genereer overzicht</button>
        </div>
      </div>

      {meta && !meta.hasShoot && (
        <div className="card-base border-amber-200 bg-amber-50/40 flex items-center justify-between gap-3 flex-wrap no-print">
          <span className="text-sm text-amber-800 flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Geen content shoot gepland voor deze maand(en).</span>
          <button onClick={flagNeed} className="btn-secondary text-sm">Behoefte aan shoot markeren</button>
        </div>
      )}

      {overview && (
        <div className="card-base">
          <div className="flex items-center justify-between gap-2 mb-3 no-print">
            <div className="text-sm text-gray-500">{meta?.scriptCount} scripts · {meta?.clientName}</div>
            <div className="flex gap-2">
              <button onClick={download} className="btn-secondary text-sm"><Download className="h-4 w-4" />Download (.md)</button>
              <button onClick={() => window.print()} className="btn-secondary text-sm"><Printer className="h-4 w-4" />Print / PDF</button>
            </div>
          </div>
          <div className="shoot-doc prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: mdToHtml(overview) }} />
        </div>
      )}

      <style>{`
        .shoot-doc h1{font-size:1.25rem;font-weight:700;margin:0.6rem 0 0.3rem}
        .shoot-doc h2{font-size:1.05rem;font-weight:700;margin:0.8rem 0 0.3rem;border-top:1px solid #eee;padding-top:0.6rem}
        .shoot-doc h3{font-size:0.95rem;font-weight:600;margin:0.6rem 0 0.2rem}
        .shoot-doc p{font-size:0.875rem;margin:0.25rem 0;line-height:1.5}
        .shoot-doc ul{margin:0.25rem 0 0.5rem 1.1rem;list-style:disc}
        .shoot-doc li{font-size:0.875rem;margin:0.15rem 0;line-height:1.45}
        @media print{.no-print{display:none!important}}
      `}</style>
    </div>
  )
}
