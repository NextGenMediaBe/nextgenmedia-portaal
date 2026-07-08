'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Loader2, AlertTriangle, Eye, Heart, MessageCircle, Share2, Users, TrendingUp,
  Bookmark, ExternalLink, Image as ImageIcon, Video, Film, FileText,
} from 'lucide-react'

type MetricTotals = Record<string, number>
type FormatSummary = { key: string; network: string; type: string; count: number; totals: MetricTotals; avg: MetricTotals }
type Summary = { totalPosts: number; overall: MetricTotals; byType: FormatSummary[]; byNetworkType: FormatSummary[]; heatmap: number[][]; heatmapCount: number[][] }
type Media = { type: 'image' | 'video' | 'other'; url: string; thumbnail?: string | null }
type TopPost = { id: string; network: string; type: string; datetime: string | null; text: string; media: Media[]; metrics: MetricTotals; permalink?: string | null; engagement: number }
type StatsResponse = { configured: boolean; linked?: boolean; clientName?: string; start?: string; end?: string; days?: number; summary?: Summary; top?: TopPost[] }
type ClientRow = { id: string; company_name: string; metricool_blog_id: string | null }

const METRIC_LABELS: Record<string, string> = {
  views: 'Weergaven', likes: 'Likes', comments: 'Reacties', shares: 'Shares',
  saved: 'Opgeslagen', reach: 'Bereik', impressions: 'Impressies', engagement: 'Engagement', interactions: 'Interacties',
}
const TYPE_LABEL: Record<string, string> = { reel: 'Reels', post: 'Posts', story: 'Stories', video: "Video's", tweet: 'Tweets' }
const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = { reel: Film, video: Film, story: ImageIcon, post: FileText, tweet: FileText }
const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const DAYS_OPTIONS = [30, 90, 180]

function fmt(n: number | undefined): string {
  if (n == null || !isFinite(n)) return '—'
  const v = Math.round(n)
  if (Math.abs(v) >= 1000) return (v / 1000).toFixed(v % 1000 === 0 ? 0 : 1).replace('.', ',') + 'k'
  return String(v)
}
function timeLabel(dt: string | null): string {
  if (!dt) return ''
  const m = dt.match(/T(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}` : ''
}
function dateShort(dt: string | null): string {
  if (!dt) return ''
  const [y, mo, d] = dt.slice(0, 10).split('-').map(Number)
  if (!y || !mo || !d) return dt.slice(0, 10)
  return new Date(y, mo - 1, d, 12).toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })
}

export function MetricoolStats() {
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [clientId, setClientId] = useState('')
  const [days, setDays] = useState(90)
  const [data, setData] = useState<StatsResponse | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetch('/api/admin/metricool/brands').then((r) => r.json()).then((j) => {
      setConfigured(!!j.configured)
      const linked = (j.clients ?? []).filter((c: ClientRow) => c.metricool_blog_id)
      setClients(linked)
      if (linked[0]) setClientId(linked[0].id)
    }).catch(() => setConfigured(false))
  }, [])

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/metricool/stats?clientId=${clientId}&days=${days}`)
      setData(await res.json())
    } catch { setData(null) } finally { setLoading(false) }
  }, [clientId, days])

  useEffect(() => { if (clientId) load() }, [load, clientId])

  const summary = data?.summary
  const heatMax = useMemo(() => {
    if (!summary) return 0
    let m = 0
    for (const row of summary.heatmap) for (const v of row) if (v > m) m = v
    return m
  }, [summary])
  const bestCell = useMemo(() => {
    if (!summary || heatMax <= 0) return null
    for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (summary.heatmap[d][h] === heatMax) return { d, h }
    return null
  }, [summary, heatMax])

  if (configured === null) {
    return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mr-2" />Laden…</div>
  }
  if (!configured) {
    return <div className="card-base border-amber-200 bg-amber-50/40 text-sm text-amber-800 flex items-start gap-3"><AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />Metricool is nog niet geconfigureerd (env-sleutel ontbreekt).</div>
  }
  if (clients.length === 0) {
    return <div className="card-base text-sm text-gray-500">Nog geen klanten gekoppeld aan een Metricool-merk. Koppel ze eerst via <b>Metricool → Kalender → Klanten koppelen</b>.</div>
  }

  const kpis: Array<{ key: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'views', label: 'Weergaven', icon: Eye },
    { key: 'likes', label: 'Likes', icon: Heart },
    { key: 'comments', label: 'Reacties', icon: MessageCircle },
    { key: 'shares', label: 'Shares', icon: Share2 },
    { key: 'reach', label: 'Bereik', icon: Users },
  ]

  const maxAvgEng = Math.max(1, ...(summary?.byType ?? []).map((f) => f.avg.engagement ?? engagementFromTotals(f.avg)))
  const maxAvgViews = Math.max(1, ...(summary?.byType ?? []).map((f) => f.avg.views ?? 0))

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-base max-w-xs">
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
        <div className="flex items-center gap-1">
          {DAYS_OPTIONS.map((d) => (
            <button key={d} onClick={() => setDays(d)} className={`text-xs px-3 py-1.5 rounded-lg border ${days === d ? 'bg-black text-white border-black' : 'border-gray-200 hover:bg-gray-50'}`}>
              {d} dagen
            </button>
          ))}
          {loading && <Loader2 className="h-4 w-4 animate-spin text-gray-400 ml-1" />}
        </div>
      </div>

      {data && data.linked === false && (
        <div className="card-base text-sm text-gray-500">Deze klant is niet gekoppeld aan een Metricool-merk.</div>
      )}

      {summary && summary.totalPosts === 0 && !loading && (
        <div className="card-base border-amber-200 bg-amber-50/40 text-sm text-amber-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Geen gepubliceerde posts met cijfers gevonden in deze periode.</p>
            <p className="mt-1 text-amber-700">Mogelijk zijn de metric-velden anders benoemd. Open <code className="font-mono">/api/admin/metricool/stats?clientId={clientId}&amp;diag=1</code> en stuur de output door — dan verfijn ik de mapping.</p>
          </div>
        </div>
      )}

      {summary && summary.totalPosts > 0 && (
        <>
          {/* KPI-tegels */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-1"><TrendingUp className="h-4 w-4 text-[#c5b800]" /><span className="text-xs text-gray-500 font-medium">Posts</span></div>
              <div className="text-2xl font-bold">{summary.totalPosts}</div>
            </div>
            {kpis.map((k) => (
              <div key={k.key} className="stat-card">
                <div className="flex items-center gap-2 mb-1"><k.icon className="h-4 w-4 text-gray-400" /><span className="text-xs text-gray-500 font-medium">{k.label}</span></div>
                <div className="text-2xl font-bold">{fmt(summary.overall[k.key])}</div>
              </div>
            ))}
          </div>

          {/* Wat werkt: per formaat */}
          <div className="card-base">
            <h2 className="font-semibold text-gray-900 mb-4">Wat werkt — per formaat</h2>
            <div className="space-y-4">
              {summary.byType.map((f) => {
                const Icon = TYPE_ICON[f.type] ?? FileText
                const eng = f.avg.engagement ?? engagementFromTotals(f.avg)
                const views = f.avg.views ?? 0
                return (
                  <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 sm:gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-gray-500" />
                      <span className="font-medium text-sm">{TYPE_LABEL[f.type] ?? f.type}</span>
                      <span className="text-xs text-gray-400">×{f.count}</span>
                    </div>
                    <div className="space-y-1.5">
                      <Bar label="Gem. engagement" value={eng} max={maxAvgEng} color="#c5b800" />
                      <Bar label="Gem. weergaven" value={views} max={maxAvgViews} color="#3b82f6" />
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-gray-500 pt-0.5">
                        <span>❤ {fmt(f.avg.likes)}</span>
                        <span>💬 {fmt(f.avg.comments)}</span>
                        <span>↗ {fmt(f.avg.shares)}</span>
                        {f.avg.saved != null && <span>🔖 {fmt(f.avg.saved)}</span>}
                        {f.avg.reach != null && <span>Bereik {fmt(f.avg.reach)}</span>}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">Gemiddelden per post. Zo zie je in één oogopslag of reels beter scoren dan posts voor deze klant.</p>
          </div>

          {/* Beste posttijd */}
          <div className="card-base">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <h2 className="font-semibold text-gray-900">Beste moment om te posten</h2>
              {bestCell && (
                <span className="text-xs text-gray-600 bg-[#fff848]/30 border border-[#fff848] rounded-full px-2.5 py-1">
                  Sterkste: <b>{WEEKDAYS[bestCell.d]}</b> om <b>{String(bestCell.h).padStart(2, '0')}:00</b>
                </span>
              )}
            </div>
            <Heatmap heatmap={summary.heatmap} counts={summary.heatmapCount} max={heatMax} />
            <p className="text-[11px] text-gray-400 mt-2">Gemiddelde engagement per dag &amp; uur (op basis van wanneer deze klant historisch postte). Donkerder = beter.</p>
          </div>

          {/* Topposts */}
          {data?.top && data.top.length > 0 && (
            <div className="card-base">
              <h2 className="font-semibold text-gray-900 mb-3">Topposts (op engagement)</h2>
              <div className="grid sm:grid-cols-2 gap-2">
                {data.top.map((p) => {
                  const thumb = p.media.find((m) => m.type === 'image')?.url ?? p.media.find((m) => m.type === 'video')?.thumbnail ?? null
                  const Icon = TYPE_ICON[p.type] ?? FileText
                  return (
                    <div key={p.id} className="flex items-center gap-3 p-2 rounded-xl border border-gray-100">
                      <span className="h-12 w-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 flex items-center justify-center">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (p.media.some((m) => m.type === 'video') ? <Video className="h-4 w-4 text-gray-300" /> : <ImageIcon className="h-4 w-4 text-gray-300" />)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mb-0.5">
                          <Icon className="h-3 w-3" /><span className="capitalize">{p.network}</span>
                          <span>· {dateShort(p.datetime)} {timeLabel(p.datetime)}</span>
                        </div>
                        <div className="text-xs text-gray-700 truncate">{p.text || '(geen tekst)'}</div>
                        <div className="flex flex-wrap gap-x-3 text-[11px] text-gray-500 mt-0.5">
                          {p.metrics.views != null && <span>👁 {fmt(p.metrics.views)}</span>}
                          <span>❤ {fmt(p.metrics.likes)}</span>
                          <span>💬 {fmt(p.metrics.comments)}</span>
                          <span className="font-medium text-gray-700">Σ {fmt(p.engagement)}</span>
                        </div>
                      </div>
                      {p.permalink && <a href={p.permalink} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-gray-600 shrink-0"><ExternalLink className="h-4 w-4" /></a>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Per netwerk × formaat (compacte tabel) */}
          {summary.byNetworkType.length > 1 && (
            <div className="card-base overflow-x-auto">
              <h2 className="font-semibold text-gray-900 mb-3">Per netwerk &amp; formaat</h2>
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400 border-b border-gray-100">
                    <th className="py-2 pr-3">Netwerk / formaat</th><th className="py-2 px-3">#</th>
                    <th className="py-2 px-3">Gem. weergaven</th><th className="py-2 px-3">Gem. likes</th><th className="py-2 px-3">Gem. engagement</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byNetworkType.map((f) => (
                    <tr key={f.key} className="border-b border-gray-50">
                      <td className="py-2 pr-3 capitalize">{f.network} · {TYPE_LABEL[f.type] ?? f.type}</td>
                      <td className="py-2 px-3 text-gray-500">{f.count}</td>
                      <td className="py-2 px-3">{fmt(f.avg.views)}</td>
                      <td className="py-2 px-3">{fmt(f.avg.likes)}</td>
                      <td className="py-2 px-3 font-medium">{fmt(f.avg.engagement ?? engagementFromTotals(f.avg))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-gray-400 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Enkel intern — deze statistieken worden nooit in het klantportaal getoond.
          </p>
        </>
      )}
    </div>
  )
}

function engagementFromTotals(m: MetricTotals): number {
  const sum = (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saved ?? 0)
  return sum > 0 ? sum : (m.engagement ?? m.interactions ?? 0)
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-gray-500 w-28 shrink-0">{label}</span>
      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[11px] font-medium text-gray-700 w-12 text-right tabular-nums">{fmt(value)}</span>
    </div>
  )
}

function Heatmap({ heatmap, counts, max }: { heatmap: number[][]; counts: number[][]; max: number }) {
  const hours = Array.from({ length: 24 }, (_, h) => h)
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid" style={{ gridTemplateColumns: `32px repeat(24, 1fr)` }}>
          <div />
          {hours.map((h) => (
            <div key={h} className="text-center text-[9px] text-gray-400 pb-1">{h % 3 === 0 ? h : ''}</div>
          ))}
          {WEEKDAYS.map((wd, d) => (
            <FragmentRow key={wd} label={wd} row={heatmap[d]} counts={counts[d]} max={max} />
          ))}
        </div>
      </div>
    </div>
  )
}

function FragmentRow({ label, row, counts, max }: { label: string; row: number[]; counts: number[]; max: number }) {
  return (
    <>
      <div className="text-[10px] text-gray-500 font-medium flex items-center pr-1">{label}</div>
      {row.map((v, h) => {
        const alpha = max > 0 && v > 0 ? 0.12 + 0.88 * (v / max) : 0
        const has = counts[h] > 0
        return (
          <div
            key={h}
            className="aspect-square rounded-[3px] m-[1px] border border-gray-100"
            style={{ background: alpha > 0 ? `rgba(197,184,0,${alpha})` : (has ? '#f8fafc' : '#fbfbfb') }}
            title={has ? `${label} ${String(h).padStart(2, '0')}:00 — gem. engagement ${Math.round(v)} (${counts[h]} post(s))` : `${label} ${String(h).padStart(2, '0')}:00 — geen posts`}
          />
        )
      })}
    </>
  )
}
