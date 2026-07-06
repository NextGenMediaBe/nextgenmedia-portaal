'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Loader2, Link2, X, Check, AlertTriangle,
  Image as ImageIcon, Video, Calendar, Clock, ExternalLink, RefreshCw,
} from 'lucide-react'
import { ymd } from '@/lib/utils'

type Brand = { blogId: string; name: string; picture?: string | null }
type ClientRow = { id: string; company_name: string; metricool_blog_id: string | null; metricool_brand_name: string | null }
type Media = { type: 'image' | 'video' | 'other'; url: string; thumbnail?: string | null }
type Post = {
  id: string; blogId: string; datetime: string | null; networks: string[]
  text: string; status: string; media: Media[]; permalink?: string | null
  clientId: string; clientName: string
}

const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const PALETTE = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#4f46e5', '#ca8a04', '#0d9488']
function colorFor(clientId: string): string {
  let h = 0
  for (let i = 0; i < clientId.length; i++) h = (h * 31 + clientId.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const dow = (first.getDay() + 6) % 7
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow)
}
function timeLabel(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })
}

const STATUS_STYLE: Record<string, string> = {
  published: 'bg-green-50 text-green-700 border-green-200',
  scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
  draft: 'bg-gray-100 text-gray-600 border-gray-200',
  error: 'bg-red-50 text-red-700 border-red-200',
}
const STATUS_LABEL: Record<string, string> = {
  published: 'Gepubliceerd', scheduled: 'Ingepland', draft: 'Concept', error: 'Fout',
}

export function MetricoolClient() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [migrated, setMigrated] = useState(true)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [brands, setBrands] = useState<Brand[]>([])
  const [selectedClients, setSelectedClients] = useState<Set<string>>(new Set()) // leeg = alle gekoppelde
  const [cursor, setCursor] = useState(() => new Date())
  const [posts, setPosts] = useState<Post[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [postErrors, setPostErrors] = useState<Array<{ clientName: string; error: string }>>([])
  const [selected, setSelected] = useState<Post | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)

  const linkedClients = useMemo(() => clients.filter((c) => c.metricool_blog_id), [clients])

  const loadBrands = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/metricool/brands')
      const j = await res.json()
      setConfigured(!!j.configured)
      setMigrated(j.migrated !== false)
      setClients(j.clients ?? [])
      setBrands(j.brands ?? [])
    } catch { setConfigured(false) }
  }, [])

  useEffect(() => { loadBrands() }, [loadBrands])

  const loadPosts = useCallback(async () => {
    if (configured === false) return
    setLoadingPosts(true)
    try {
      const start = ymd(new Date(cursor.getFullYear(), cursor.getMonth(), 1))
      const end = ymd(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0))
      const ids = Array.from(selectedClients)
      const qs = new URLSearchParams({ start, end })
      if (ids.length > 0) qs.set('clientIds', ids.join(','))
      const res = await fetch(`/api/admin/metricool/posts?${qs.toString()}`)
      const j = await res.json()
      setPosts(j.posts ?? [])
      setPostErrors(j.errors ?? [])
    } catch { setPosts([]) } finally { setLoadingPosts(false) }
  }, [cursor, selectedClients, configured])

  useEffect(() => { if (configured) loadPosts() }, [loadPosts, configured])

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>()
    for (const p of posts) {
      if (!p.datetime) continue
      const key = ymd(new Date(p.datetime))
      const list = m.get(key) ?? []
      list.push(p)
      m.set(key, list)
    }
    for (const list of m.values()) list.sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''))
    return m
  }, [posts])

  const nextPost = useMemo(() => {
    const now = Date.now()
    return posts
      .filter((p) => p.datetime && new Date(p.datetime).getTime() >= now)
      .sort((a, b) => (a.datetime ?? '').localeCompare(b.datetime ?? ''))[0] ?? null
  }, [posts])

  const days = useMemo(() => {
    const start = startOfMonthGrid(cursor)
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start); d.setDate(start.getDate() + i); return d
    })
  }, [cursor])

  const title = cursor.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const today = ymd(new Date())

  const toggleClient = (id: string) => setSelectedClients((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  if (configured === null) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" />Laden…</div>
  }

  if (!configured) {
    return (
      <div className="card-base border-amber-200 bg-amber-50/40">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">Metricool is nog niet geconfigureerd.</p>
            <p className="mt-1 text-amber-700">Zet <code className="font-mono">METRICOOL_USER_TOKEN</code> en <code className="font-mono">METRICOOL_USER_ID</code> in de omgeving (Vercel) en herlaad deze pagina.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSelectedClients(new Set())} className={`text-xs px-3 py-1.5 rounded-lg border ${selectedClients.size === 0 ? 'bg-black text-white border-black' : 'border-gray-200 hover:bg-gray-50'}`}>
            Alle klanten ({linkedClients.length})
          </button>
          {linkedClients.map((c) => {
            const on = selectedClients.has(c.id)
            return (
              <button key={c.id} onClick={() => toggleClient(c.id)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1.5 ${on ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(c.id) }} />
                {c.company_name}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadPosts} disabled={loadingPosts} className="btn-secondary text-sm">
            {loadingPosts ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Verversen
          </button>
          <button onClick={() => setLinkOpen(true)} className="btn-secondary text-sm"><Link2 className="h-4 w-4" />Klanten koppelen</button>
        </div>
      </div>

      {linkedClients.length === 0 && (
        <div className="card-base text-sm text-gray-500">
          Nog geen klanten gekoppeld aan een Metricool-merk. Klik op <b>Klanten koppelen</b> om te starten.
        </div>
      )}

      {/* Volgende post-samenvatting */}
      {nextPost && (
        <div className="card-base flex items-center gap-3 flex-wrap">
          <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: colorFor(nextPost.clientId) }} />
          <div className="text-sm">
            <span className="text-gray-500">Volgende post:</span>{' '}
            <b>{nextPost.clientName}</b> —{' '}
            {nextPost.datetime && new Date(nextPost.datetime).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })}
            {' '}om <b>{timeLabel(nextPost.datetime)}</b>
            {nextPost.networks.length > 0 && <span className="text-gray-400"> · {nextPost.networks.join(', ')}</span>}
          </div>
          <button onClick={() => setSelected(nextPost)} className="ml-auto text-xs text-gray-500 hover:text-black">Bekijk →</button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Kalender */}
        <div className="flex-1 bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-1">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><ChevronLeft className="h-4 w-4" /></button>
              <button onClick={() => setCursor(new Date())} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Vandaag</button>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100"><ChevronRight className="h-4 w-4" /></button>
              <span className="ml-2 font-semibold capitalize text-sm">{title}</span>
            </div>
            {loadingPosts && <Loader2 className="h-4 w-4 animate-spin text-gray-400" />}
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100">
            {WEEKDAYS.map((w) => <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2">{w}</div>)}
          </div>

          <div className="grid grid-cols-7 grid-rows-6">
            {days.map((d, idx) => {
              const dayStr = ymd(d)
              const inMonth = d.getMonth() === cursor.getMonth()
              const isToday = dayStr === today
              const items = byDay.get(dayStr) ?? []
              return (
                <div key={idx} className={`relative border-r border-b border-gray-100 p-1.5 flex flex-col gap-1 min-h-[104px] ${!inMonth ? 'bg-gray-50/50' : ''}`}>
                  <span className={`text-[11px] font-medium px-1 py-0.5 rounded-full self-start ${isToday ? 'bg-[#fff848] text-black font-bold' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>{d.getDate()}</span>
                  <div className="flex flex-col gap-0.5 overflow-hidden">
                    {items.slice(0, 4).map((p) => (
                      <button key={p.id} onClick={() => setSelected(p)} title={`${p.clientName} · ${timeLabel(p.datetime)}`}
                        className="text-left text-[11px] px-1.5 py-1 rounded border bg-white hover:bg-gray-50 transition truncate flex items-center gap-1 w-full"
                        style={{ borderColor: colorFor(p.clientId) }}>
                        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: colorFor(p.clientId) }} />
                        <span className="tabular-nums text-gray-500 shrink-0">{timeLabel(p.datetime)}</span>
                        <span className="truncate">{p.clientName}</span>
                      </button>
                    ))}
                    {items.length > 4 && <div className="text-[10px] text-gray-400 px-1">+{items.length - 4} meer</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Preview-paneel */}
        <div className="lg:w-[380px]">
          <PreviewPanel post={selected} onClose={() => setSelected(null)} />
        </div>
      </div>

      {postErrors.length > 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Kon posts voor {postErrors.length} klant(en) niet ophalen: {postErrors.map((e) => e.clientName).join(', ')}.
        </div>
      )}

      {linkOpen && (
        <LinkDialog
          clients={clients}
          brands={brands}
          migrated={migrated}
          onClose={() => setLinkOpen(false)}
          onChanged={loadBrands}
        />
      )}
    </div>
  )
}

function PreviewPanel({ post, onClose }: { post: Post | null; onClose: () => void }) {
  if (!post) {
    return (
      <aside className="w-full bg-white border border-gray-200 rounded-xl p-5 h-fit shadow-sm">
        <div className="text-center py-8"><Calendar className="h-8 w-8 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400">Klik op een post voor de preview</p></div>
      </aside>
    )
  }
  const style = STATUS_STYLE[post.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
  return (
    <aside className="w-full bg-white border border-gray-200 rounded-xl shadow-sm h-fit lg:sticky lg:top-6 max-h-[80vh] flex flex-col overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`status-badge border ${style}`}>{STATUS_LABEL[post.status] ?? post.status}</span>
            {post.networks.map((n) => <span key={n} className="capitalize bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px]">{n}</span>)}
          </div>
          <h3 className="font-semibold text-gray-900 leading-snug">{post.clientName}</h3>
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {post.datetime ? new Date(post.datetime).toLocaleString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Geen tijd'}
          </div>
        </div>
        <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 shrink-0"><X className="h-4 w-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {post.media.length > 0 ? (
          <div className="space-y-2">
            {post.media.map((m, i) => (
              <div key={i} className="rounded-lg overflow-hidden border border-gray-100 bg-gray-50">
                {m.type === 'video' ? (
                  <video src={m.url} controls playsInline className="w-full max-h-[320px] bg-black" poster={m.thumbnail ?? undefined} />
                ) : m.type === 'image' ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.url} alt="preview" className="w-full object-cover max-h-[320px]" />
                ) : (
                  <a href={m.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-3 text-sm text-blue-600 hover:underline"><ExternalLink className="h-4 w-4" />Media openen</a>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-gray-200 p-6 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
            <span className="flex gap-1"><ImageIcon className="h-5 w-5" /><Video className="h-5 w-5" /></span>
            Geen media-preview beschikbaar
          </div>
        )}

        {post.text && (
          <div>
            <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Tekst</div>
            <p className="text-sm whitespace-pre-wrap text-gray-700 leading-relaxed">{post.text}</p>
          </div>
        )}
      </div>

      {post.permalink && (
        <div className="p-4 border-t border-gray-100">
          <a href={post.permalink} target="_blank" rel="noreferrer" className="btn-secondary w-full text-sm justify-center"><ExternalLink className="h-4 w-4" />Open in Metricool</a>
        </div>
      )}
    </aside>
  )
}

function LinkDialog({
  clients, brands, migrated, onClose, onChanged,
}: {
  clients: ClientRow[]; brands: Brand[]; migrated: boolean; onClose: () => void; onChanged: () => void
}) {
  const [saving, setSaving] = useState<string | null>(null)
  const setLink = async (client: ClientRow, blogId: string) => {
    setSaving(client.id)
    try {
      const brand = brands.find((b) => b.blogId === blogId)
      await fetch('/api/admin/metricool/link', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: client.id, blogId: blogId || null, brandName: brand?.name ?? null }),
      })
      onChanged()
    } finally { setSaving(null) }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[85dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Link2 className="h-5 w-5" />Klanten koppelen aan Metricool</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-2">
          {!migrated && (
            <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              De databasekolommen ontbreken nog. Draai de migratie <code className="font-mono">99999999_SYNC_ALL.sql</code> in Supabase; daarna kun je koppelingen opslaan.
            </div>
          )}
          {brands.length === 0 && <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Geen Metricool-merken gevonden. Controleer de API-sleutel.</div>}
          {clients.length === 0 && <div className="text-sm text-gray-500 px-1 py-2">Geen klanten gevonden.</div>}
          {clients.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <div className="flex-1 min-w-0 text-sm font-medium truncate">{c.company_name}</div>
              <select
                value={c.metricool_blog_id ?? ''}
                disabled={saving === c.id || !migrated}
                onChange={(e) => setLink(c, e.target.value)}
                className="w-52 px-2 py-1.5 text-xs border border-gray-200 rounded-lg"
              >
                <option value="">— niet gekoppeld —</option>
                {brands.map((b) => <option key={b.blogId} value={b.blogId}>{b.name}</option>)}
              </select>
              {c.metricool_blog_id && <Check className="h-4 w-4 text-green-600 shrink-0" />}
              {saving === c.id && <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />}
            </div>
          ))}
        </div>
        <div className="p-4 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="btn-primary text-sm">Klaar</button>
        </div>
      </div>
    </div>
  )
}
