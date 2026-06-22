'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Newspaper, Loader2, Save, Sparkles, CheckCircle2, XCircle, ArrowRight, Plug } from 'lucide-react'
import { toast } from 'sonner'

type Settings = {
  blogs_inbegrepen: boolean; blog_startdatum: string | null; blog_frequentie_maanden: number | null
  blog_aantal_per_cyclus: number | null; blog_volgende_generatie_datum: string | null; blog_brand_context: string | null
}
type Blog = { id: string; titel: string; status: string; gegenereerd_op: string }

const STATUS_LABEL: Record<string, string> = { klaar_voor_review: 'Klaar voor review', goedgekeurd: 'Goedgekeurd', gepubliceerd: 'Gepubliceerd', gefaald: 'Gefaald' }
const STATUS_CLS: Record<string, string> = { klaar_voor_review: 'bg-amber-100 text-amber-700', goedgekeurd: 'bg-blue-100 text-blue-700', gepubliceerd: 'bg-green-100 text-green-700', gefaald: 'bg-red-100 text-red-700' }

export function ClientBlogs({ clientId }: { clientId: string }) {
  const [s, setS] = useState<Settings | null>(null)
  const [framerValid, setFramerValid] = useState(false)
  const [blogs, setBlogs] = useState<Blog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [setRes, blogRes] = await Promise.all([
        fetch(`/api/admin/blog-settings?client_id=${clientId}`),
        fetch(`/api/admin/blogs?client_id=${clientId}`),
      ])
      const sj = await setRes.json(); const bj = await blogRes.json()
      if (setRes.ok) {
        setS({
          blogs_inbegrepen: sj.settings.blogs_inbegrepen, blog_startdatum: sj.settings.blog_startdatum,
          blog_frequentie_maanden: sj.settings.blog_frequentie_maanden, blog_aantal_per_cyclus: sj.settings.blog_aantal_per_cyclus,
          blog_volgende_generatie_datum: sj.settings.blog_volgende_generatie_datum, blog_brand_context: sj.settings.blog_brand_context,
        })
        setFramerValid(sj.framerValid)
      }
      if (blogRes.ok) setBlogs((bj.blogs ?? []) as Blog[])
    } catch { /* stil */ } finally { setLoading(false) }
  }, [clientId])

  useEffect(() => { load() }, [load])

  const upd = (patch: Partial<Settings>) => setS((prev) => prev ? { ...prev, ...patch } : prev)

  const save = async () => {
    if (!s) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/blog-settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          blogs_inbegrepen: s.blogs_inbegrepen,
          blog_startdatum: s.blog_startdatum,
          blog_frequentie_maanden: s.blog_frequentie_maanden,
          blog_aantal_per_cyclus: s.blog_aantal_per_cyclus,
          blog_brand_context: s.blog_brand_context,
          blog_volgende_generatie_datum: s.blog_volgende_generatie_datum,
        }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success('Bloginstellingen opgeslagen.')
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setSaving(false) }
  }

  const generateNow = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/admin/blogs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'generate', client_id: clientId }) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success(`${j.created} blog(s) gegenereerd — klaar voor review.`)
      await load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setGenerating(false) }
  }

  if (loading || !s) return <div className="card-base"><div className="py-4 text-center text-gray-400"><Loader2 className="h-4 w-4 animate-spin mx-auto" /></div></div>

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  const checklist: { ok: boolean; label: string }[] = [
    { ok: s.blogs_inbegrepen, label: 'Blogs inbegrepen aangezet' },
    { ok: !!s.blog_startdatum, label: 'Startdatum ingesteld' },
    { ok: !!s.blog_frequentie_maanden, label: 'Frequentie ingesteld' },
    { ok: !!s.blog_aantal_per_cyclus, label: 'Aantal per cyclus ingesteld' },
    { ok: !!s.blog_brand_context, label: 'Brand context ingevuld' },
  ]

  return (
    <div className="card-base space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2"><Newspaper className="h-4 w-4 text-gray-400" />Blogs</h2>
        <Link href={`/admin/blogs?client=${clientId}`} className="text-xs text-gray-500 hover:text-black inline-flex items-center gap-1">Review <ArrowRight className="h-3 w-3" /></Link>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={s.blogs_inbegrepen} onChange={(e) => upd({ blogs_inbegrepen: e.target.checked })} />
        Blogs inbegrepen voor deze klant
      </label>

      {s.blogs_inbegrepen && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-gray-600 mb-1">Startdatum</label><input type="date" className={inp} value={s.blog_startdatum ?? ''} onChange={(e) => upd({ blog_startdatum: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Volgende generatie</label><input type="date" className={inp} value={s.blog_volgende_generatie_datum ?? ''} onChange={(e) => upd({ blog_volgende_generatie_datum: e.target.value })} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Frequentie (maanden)</label><input type="number" min="1" className={inp} value={s.blog_frequentie_maanden ?? 1} onChange={(e) => upd({ blog_frequentie_maanden: Number(e.target.value) })} /></div>
            <div><label className="block text-xs text-gray-600 mb-1">Aantal per cyclus</label><input type="number" min="1" className={inp} value={s.blog_aantal_per_cyclus ?? 1} onChange={(e) => upd({ blog_aantal_per_cyclus: Number(e.target.value) })} /></div>
          </div>
          <div><label className="block text-xs text-gray-600 mb-1">Brand context</label><textarea rows={3} className={inp} value={s.blog_brand_context ?? ''} onChange={(e) => upd({ blog_brand_context: e.target.value })} placeholder="Toon, doelgroep, thema's, do's & don'ts…" /></div>

          {/* Framer status — read-only. Configuratie gebeurt in Framer Manager. */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm inline-flex items-center gap-2">
              <Plug className="h-4 w-4 text-gray-400" />
              {framerValid
                ? <span className="inline-flex items-center gap-1.5 text-green-700">🟢 Framer gekoppeld</span>
                : <span className="inline-flex items-center gap-1.5 text-amber-700">🟠 Framer nog niet geconfigureerd</span>}
            </span>
            <Link href={`/admin/framer`} className="btn-secondary text-xs">Beheer in Framer Manager</Link>
          </div>

          <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
            <div className="text-xs font-medium text-gray-500 mb-2">Checklist</div>
            <div className="space-y-1">
              {checklist.map((c) => (
                <div key={c.label} className="flex items-center gap-2 text-xs">
                  {c.ok ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                  <span className={c.ok ? 'text-gray-700' : 'text-gray-400'}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 flex-wrap">
        <button onClick={save} disabled={saving} className="btn-primary text-sm">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Opslaan</button>
        {s.blogs_inbegrepen && <button onClick={generateNow} disabled={generating} className="btn-secondary text-sm">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Genereer nu</button>}
      </div>

      {blogs.length > 0 && (
        <div className="border-t border-gray-100 pt-3">
          <div className="text-xs font-medium text-gray-500 mb-2">Laatste blogs</div>
          <div className="space-y-1">
            {blogs.slice(0, 5).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{b.titel}</span>
                <span className={`status-badge text-[10px] shrink-0 ${STATUS_CLS[b.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[b.status] ?? b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
