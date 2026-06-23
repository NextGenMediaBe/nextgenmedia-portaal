'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, X, Loader2, Pencil, Trash2, Sparkles, Newspaper, Plug, CheckCircle2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

type Account = {
  id: string; name: string; website_url: string | null; client_id: string | null; client_name: string | null
  active: boolean; frequentie_maanden: number; aantal_per_cyclus: number; startdatum: string | null
  volgende_generatie_datum: string | null; max_live_blogs: number | null; briefing: string | null
  framer_project_url: string | null; has_api_key: boolean; framer_valid: boolean
  published: number; review: number; failed: number
}
type ClientOpt = { id: string; company_name: string }

export function BlogAccountsManager() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState<{ account: Account | null } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

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
                    {a.name}
                    {!a.active && <span className="status-badge bg-gray-100 text-gray-500 text-[10px]">inactief</span>}
                    {a.client_name ? <span className="status-badge bg-sky-100 text-sky-700 text-[10px]">klant: {a.client_name}</span> : <span className="status-badge bg-gray-100 text-gray-500 text-[10px]">zelfstandig</span>}
                    {a.framer_valid ? <span className="inline-flex items-center gap-1 text-[10px] text-green-700"><CheckCircle2 className="h-3 w-3" />Framer ok</span> : <span className="inline-flex items-center gap-1 text-[10px] text-amber-600"><AlertTriangle className="h-3 w-3" />Framer onvolledig</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-x-3">
                    {a.website_url && <span>{a.website_url.replace(/^https?:\/\//, '')}</span>}
                    <span>{a.aantal_per_cyclus}× per {a.frequentie_maanden} mnd</span>
                    <span>volgende: {a.volgende_generatie_datum ? formatDate(a.volgende_generatie_datum) : '—'}</span>
                    {a.max_live_blogs ? <span>max {a.max_live_blogs} live</span> : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                    <span className="status-badge bg-green-100 text-green-700">{a.published} gepubliceerd</span>
                    <span className="status-badge bg-amber-100 text-amber-700">{a.review} review</span>
                    {a.failed > 0 && <span className="status-badge bg-red-100 text-red-700">{a.failed} gefaald</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Link href={`/admin/blogs?account=${a.id}`} className="btn-secondary text-xs">Review</Link>
                  <Link href="/admin/framer" className="btn-secondary text-xs"><Plug className="h-3.5 w-3.5" />Framer</Link>
                  <button onClick={() => generate(a.id)} disabled={busy === a.id} className="btn-secondary text-xs">{busy === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}Genereer</button>
                  <button onClick={() => setDialog({ account: a })} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => remove(a)} disabled={busy === a.id} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && <AccountDialog account={dialog.account} clients={clients} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); load() }} />}
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!f.name.trim()) { setError('Naam is verplicht'); return }
    setLoading(true); setError(null)
    try {
      const body: Record<string, unknown> = { ...f, client_id: f.client_id || null, max_live_blogs: f.max_live_blogs || null, startdatum: f.startdatum || null }
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
