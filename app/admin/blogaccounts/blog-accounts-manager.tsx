'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, X, Loader2, Pencil, Trash2, Sparkles, Newspaper, Plug, CheckCircle2, AlertTriangle, ScanSearch, BarChart3, BookOpen } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

export type Knowledge = {
  bedrijfsinformatie?: string; doelgroep?: string; tone_of_voice?: string
  belangrijke_termen?: string[]; verboden_woorden?: string[]; cases?: string[]
}

type Account = {
  id: string; name: string; website_url: string | null; client_id: string | null; client_name: string | null
  active: boolean; frequentie_maanden: number; aantal_per_cyclus: number; startdatum: string | null
  volgende_generatie_datum: string | null; max_live_blogs: number | null; briefing: string | null
  framer_project_url: string | null; has_api_key: boolean; framer_valid: boolean
  website_analyzed_at: string | null; has_analysis: boolean
  knowledge: Knowledge | null; has_knowledge: boolean
  website_changed: boolean; website_change_details: string[]; website_monitor_at: string | null
  published: number; review: number; failed: number; sync_problems: number
  health_score: number; health_status: 'groen' | 'oranje' | 'rood'; warnings: string[]
}
type ClientOpt = { id: string; company_name: string }

const HEALTH_DOT: Record<string, string> = { groen: 'bg-green-500', oranje: 'bg-amber-500', rood: 'bg-red-500' }

export function BlogAccountsManager() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ account: Account | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [seoOpen, setSeoOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try { const res = await fetch('/api/admin/blog-accounts'); const j = await res.json(); if (res.ok) { setAccounts(j.accounts ?? []); setClients(j.clients ?? []) } }
    catch { /* stil */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const generate = async (id: string) => {
    setBusy(id)
    try { const res = await fetch('/api/admin/blogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', account_id: id }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); toast.success(`${j.created} blog(s) gegenereerd.`) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }
  const remove = async (a: Account) => {
    if (!confirm(`Blogaccount "${a.name}" verwijderen?`)) return
    setBusy(a.id)
    try { const res = await fetch(`/api/admin/blog-accounts?id=${a.id}`, { method: 'DELETE' }); const j = await res.json(); if (!res.ok) throw new Error(j.error); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }
  const reanalyze = async (id: string) => {
    setBusy(id + ':analyze')
    try { const res = await fetch('/api/admin/blog-accounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reanalyze', id }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); toast.success('Website opnieuw geanalyseerd.'); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><button onClick={() => setDialog({ account: null })} className="btn-primary text-sm"><Plus className="h-4 w-4" />Blogaccount</button></div>

      {loading ? (
        <div className="card-base text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
      ) : accounts.length === 0 ? (
        <div className="card-base empty-state"><Newspaper className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="text-sm">Nog geen blogaccounts.</p></div>
      ) : (
        <div className="space-y-3">
          {accounts.map((a) => (
            <div key={a.id} className="card-base">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    <span className={`h-2.5 w-2.5 rounded-full ${HEALTH_DOT[a.health_status]}`} title={`Health ${a.health_score}/100`} />
                    {a.name}
                    <span className="text-[10px] text-gray-400">health {a.health_score}/100</span>
                    {!a.active && <span className="status-badge bg-gray-100 text-gray-500 text-[10px]">inactief</span>}
                    {a.client_name ? <span className="status-badge bg-sky-100 text-sky-700 text-[10px]">klant: {a.client_name}</span> : <span className="status-badge bg-gray-100 text-gray-500 text-[10px]">zelfstandig</span>}
                    {a.framer_valid ? <span className="inline-flex items-center gap-1 text-[10px] text-green-700"><CheckCircle2 className="h-3 w-3" />Framer ok</span> : <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-3 w-3" />Framer onvolledig</span>}
                    {a.has_knowledge && <span className="inline-flex items-center gap-1 text-[10px] text-indigo-600"><BookOpen className="h-3 w-3" />kennisbank</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
                    {a.website_url && <span>{a.website_url.replace(/^https?:\/\//, '')}</span>}
                    <span>{a.aantal_per_cyclus}× per {a.frequentie_maanden} mnd</span>
                    <span>volgende: {a.volgende_generatie_datum ? formatDate(a.volgende_generatie_datum) : '—'}</span>
                    {a.max_live_blogs ? <span>max {a.max_live_blogs} live</span> : null}
                    <span className={a.has_analysis ? 'text-green-600' : 'text-gray-400'}>{a.has_analysis ? `website-analyse ✓${a.website_analyzed_at ? ` (${formatDate(a.website_analyzed_at)})` : ''}` : 'nog niet geanalyseerd'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="status-badge bg-green-100 text-green-700">{a.published} gepubliceerd</span>
                    <span className="status-badge bg-amber-100 text-amber-700">{a.review} review</span>
                    {a.failed > 0 && <span className="status-badge bg-red-100 text-red-700">{a.failed} gefaald</span>}
                    {a.sync_problems > 0 && <span className="status-badge bg-orange-100 text-orange-700">{a.sync_problems} sync</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/admin/blogs?account=${a.id}`} className="btn-secondary text-xs">Review</Link>
                  <button onClick={() => setSeoOpen(seoOpen === a.id ? null : a.id)} className="btn-secondary text-xs"><BarChart3 className="h-3.5 w-3.5" />SEO</button>
                  <Link href="/admin/framer" className="btn-secondary text-xs"><Plug className="h-3.5 w-3.5" />Framer</Link>
                  {a.website_url && <button onClick={() => reanalyze(a.id)} disabled={busy === a.id + ':analyze'} className="btn-secondary text-xs" title="Website opnieuw analyseren">{busy === a.id + ':analyze' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}Analyseer site</button>}
                  <button onClick={() => generate(a.id)} disabled={busy === a.id} className="btn-secondary text-xs">{busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Genereer</button>
                  <button onClick={() => setDialog({ account: a })} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(a)} disabled={busy === a.id} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>

              {a.website_changed && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>Website gewijzigd. Heranalyse aanbevolen.{a.website_change_details?.length ? ` (${a.website_change_details.join('; ')})` : ''}</span>
                </div>
              )}
              {a.warnings.length > 0 && (
                <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  {a.warnings.map((w, i) => <li key={i} className="text-[11px] text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3 w-3 shrink-0" />{w}</li>)}
                </ul>
              )}

              {seoOpen === a.id && <SeoPanel accountId={a.id} />}
            </div>
          ))}
        </div>
      )}

      {dialog && <AccountDialog account={dialog.account} clients={clients} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
    </div>
  )
}

type Seo = { total: number; published: number; keywords: string[]; mostUsed: { tag: string; count: number }[]; leastUsed: { tag: string; count: number }[]; internalLinks: { titel: string; slug: string }[]; gaps: string[] }

function SeoPanel({ accountId }: { accountId: string }) {
  const [seo, setSeo] = useState<Seo | null>(null)
  const [loading, setLoading] = useState(true)
  const [gapBusy, setGapBusy] = useState(false)

  const load = useCallback(async (gaps?: boolean) => {
    gaps ? setGapBusy(true) : setLoading(true)
    try { const res = await fetch(`/api/admin/blog-seo?id=${accountId}${gaps ? '&gaps=1' : ''}`); const j = await res.json(); if (res.ok) setSeo((prev) => gaps ? { ...(prev as Seo), gaps: j.gaps ?? [] } : j) }
    catch { /* stil */ } finally { gaps ? setGapBusy(false) : setLoading(false) }
  }, [accountId])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3 text-center text-gray-400"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div>
  if (!seo) return null

  return (
    <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3 space-y-3">
      <div className="flex flex-wrap gap-4 text-xs">
        <span><b>{seo.total}</b> blogs</span>
        <span><b>{seo.published}</b> gepubliceerd</span>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Meest gebruikte tags</div>
          {seo.mostUsed.length === 0 ? <p className="text-[11px] text-gray-400">—</p> : <div className="flex flex-wrap gap-1">{seo.mostUsed.map((t) => <span key={t.tag} className="status-badge bg-gray-100 text-gray-600 text-[10px]">{t.tag} ({t.count})</span>)}</div>}
        </div>
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Minst gebruikte tags</div>
          {seo.leastUsed.length === 0 ? <p className="text-[11px] text-gray-400">—</p> : <div className="flex flex-wrap gap-1">{seo.leastUsed.map((t) => <span key={t.tag} className="status-badge bg-gray-100 text-gray-600 text-[10px]">{t.tag} ({t.count})</span>)}</div>}
        </div>
      </div>
      {seo.keywords.length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-gray-500 mb-1">Gebruikte SEO-zoekwoorden</div>
          <div className="flex flex-wrap gap-1">{seo.keywords.slice(0, 30).map((k) => <span key={k} className="status-badge bg-sky-50 text-sky-700 text-[10px]">{k}</span>)}</div>
        </div>
      )}
      <div>
        <div className="text-[11px] font-medium text-gray-500 mb-1">Interne linksuggesties (eigen blogs)</div>
        {seo.internalLinks.length === 0 ? <p className="text-[11px] text-gray-400">Nog geen gepubliceerde blogs om naar te linken.</p> : <ul className="text-[11px] text-gray-600 space-y-0.5 max-h-32 overflow-y-auto">{seo.internalLinks.map((l) => <li key={l.slug}>• {l.titel} <span className="text-gray-400">/{l.slug}</span></li>)}</ul>}
      </div>
      <div>
        <div className="flex items-center justify-between mb-1">
          <div className="text-[11px] font-medium text-gray-500">Content gaps (AI)</div>
          <button onClick={() => load(true)} disabled={gapBusy} className="btn-secondary text-[11px]">{gapBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}Stel ontbrekende onderwerpen voor</button>
        </div>
        {seo.gaps?.length ? <ul className="text-[11px] text-gray-700 space-y-0.5">{seo.gaps.map((g, i) => <li key={i}>• {g}</li>)}</ul> : <p className="text-[11px] text-gray-400">Klik om voorstellen te genereren.</p>}
      </div>
    </div>
  )
}

function AccountDialog({ account, clients, onClose, onSaved }: { account: Account | null; clients: ClientOpt[]; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!account
  const [f, setF] = useState({
    name: account?.name ?? '', website_url: account?.website_url ?? '', briefing: account?.briefing ?? '',
    client_id: account?.client_id ?? '', frequentie_maanden: account?.frequentie_maanden ?? 1, aantal_per_cyclus: account?.aantal_per_cyclus ?? 1,
    startdatum: account?.startdatum ?? '', max_live_blogs: account?.max_live_blogs ?? '', active: account?.active ?? true,
    framer_project_url: account?.framer_project_url ?? '',
  })
  const [apiKey, setApiKey] = useState('')
  const k = account?.knowledge ?? null
  const csv = (v?: string[]) => (v ?? []).join(', ')
  const [kn, setKn] = useState({
    bedrijfsinformatie: k?.bedrijfsinformatie ?? '', doelgroep: k?.doelgroep ?? '', tone_of_voice: k?.tone_of_voice ?? '',
    belangrijke_termen: csv(k?.belangrijke_termen), verboden_woorden: csv(k?.verboden_woorden), cases: (k?.cases ?? []).join('\n'),
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!f.name.trim()) { setError('Naam is verplicht'); return }
    setLoading(true); setError(null)
    try {
      const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean)
      const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)
      const knowledge = {
        bedrijfsinformatie: kn.bedrijfsinformatie.trim() || undefined, doelgroep: kn.doelgroep.trim() || undefined, tone_of_voice: kn.tone_of_voice.trim() || undefined,
        belangrijke_termen: list(kn.belangrijke_termen), verboden_woorden: list(kn.verboden_woorden), cases: lines(kn.cases),
      }
      const hasKnowledge = Object.values(knowledge).some((v) => Array.isArray(v) ? v.length : !!v)
      const body: Record<string, unknown> = { ...f, client_id: f.client_id || null, max_live_blogs: f.max_live_blogs || null, startdatum: f.startdatum || null, knowledge: hasKnowledge ? knowledge : null }
      if (apiKey.trim()) body.framer_api_key = apiKey.trim()
      if (isEdit) body.id = account!.id
      const res = await fetch('/api/admin/blog-accounts', { method: isEdit ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success(isEdit ? 'Opgeslagen.' : 'Blogaccount aangemaakt.'); onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setLoading(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold">{isEdit ? 'Blogaccount bewerken' : 'Nieuwe blogaccount'}</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div><label className="block text-xs text-gray-600 mb-1">Naam onderneming</label><input className={inp} value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Website URL</label><input className={inp} value={f.website_url} onChange={(e) => setF((x) => ({ ...x, website_url: e.target.value }))} placeholder="https://…" /></div>
          <div><label className="block text-xs text-gray-600 mb-1">Blog briefing / bedrijfsinformatie</label><textarea rows={5} className={inp} value={f.briefing} onChange={(e) => setF((x) => ({ ...x, briefing: e.target.value }))} placeholder="Wat doet de onderneming, doelgroep, diensten, tone of voice, USP's, SEO-focus, onderwerpen, do's & don'ts…" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-600 mb-1">Frequentie (maanden)</label><input type="number" min="1" className={inp} value={f.frequentie_maanden} onChange={(e) => setF((x) => ({ ...x, frequentie_maanden: Number(e.target.value) }))} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Aantal per cyclus</label><input type="number" min="1" className={inp} value={f.aantal_per_cyclus} onChange={(e) => setF((x) => ({ ...x, aantal_per_cyclus: Number(e.target.value) }))} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Startdatum</label><input type="date" className={inp} value={f.startdatum} onChange={(e) => setF((x) => ({ ...x, startdatum: e.target.value }))} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Max. live blogs (optioneel)</label><input type="number" min="1" className={inp} value={f.max_live_blogs} onChange={(e) => setF((x) => ({ ...x, max_live_blogs: e.target.value }))} /></div>
          </div>
          <div><label className="block text-xs text-gray-600 mb-1">Klantkoppeling (optioneel)</label>
            <select className={inp} value={f.client_id} onChange={(e) => setF((x) => ({ ...x, client_id: e.target.value }))}><option value="">— Zelfstandig (geen klant) —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select>
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Kennisbank (AI hoogste prioriteit)</div>
            <div><label className="block text-xs text-gray-600 mb-1">Bedrijfsinformatie</label><textarea rows={3} className={inp} value={kn.bedrijfsinformatie} onChange={(e) => setKn((x) => ({ ...x, bedrijfsinformatie: e.target.value }))} placeholder="Kernactiviteit, USP's, geschiedenis…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-600 mb-1">Doelgroep</label><input className={inp} value={kn.doelgroep} onChange={(e) => setKn((x) => ({ ...x, doelgroep: e.target.value }))} placeholder="bv. KMO-zaakvoerders" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Tone of voice</label><input className={inp} value={kn.tone_of_voice} onChange={(e) => setKn((x) => ({ ...x, tone_of_voice: e.target.value }))} placeholder="bv. vlot, professioneel" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs text-gray-600 mb-1">Belangrijke termen (komma)</label><input className={inp} value={kn.belangrijke_termen} onChange={(e) => setKn((x) => ({ ...x, belangrijke_termen: e.target.value }))} placeholder="term1, term2" /></div>
              <div><label className="block text-xs text-gray-600 mb-1">Verboden woorden (komma)</label><input className={inp} value={kn.verboden_woorden} onChange={(e) => setKn((x) => ({ ...x, verboden_woorden: e.target.value }))} placeholder="goedkoop, …" /></div>
            </div>
            <div><label className="block text-xs text-gray-600 mb-1">Cases / voorbeelden (één per lijn)</label><textarea rows={3} className={inp} value={kn.cases} onChange={(e) => setKn((x) => ({ ...x, cases: e.target.value }))} placeholder="Korte case of referentie per lijn" /></div>
          </div>
          <div className="border-t border-gray-100 pt-3 space-y-3">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Framer-toegang</div>
            <div><label className="block text-xs text-gray-600 mb-1">Framer project</label><input className={inp} value={f.framer_project_url} onChange={(e) => setF((x) => ({ ...x, framer_project_url: e.target.value }))} placeholder="https://…framer…" /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Framer toegangssleutel {account?.has_api_key && <span className="text-green-600">· ingesteld</span>}</label><input type="password" className={inp} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={account?.has_api_key ? '•••••• (laat leeg om te behouden)' : 'Plak hier de sleutel'} /></div>
            <p className="text-[11px] text-gray-400">Blogcollectie + velden koppel je daarna in één klik via Framer Manager → Analyseer.</p>
          </div>
          {isEdit && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF((x) => ({ ...x, active: e.target.checked }))} />Actief</label>}
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={loading} className="btn-primary flex-1 justify-center">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{isEdit ? 'Opslaan' : 'Aanmaken'}</button>
            <button onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
