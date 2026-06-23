'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Plug, AlertTriangle, RefreshCcw, Database, Sparkles } from 'lucide-react'
import { formatDate } from '@/lib/utils'

type Account = {
  id: string; name: string; client_name: string | null; active: boolean; framer_valid: boolean
  published: number; review: number; failed: number; sync_problems: number
  health_score: number; health_status: 'groen' | 'oranje' | 'rood'; warnings: string[]
  website_changed: boolean
}
type Cron = { lastRun: string | null; ok: boolean }
type AiStatus = { hasKey: boolean; keyHint: string | null; model: string; framerEnabled: boolean }

const DOT: Record<string, string> = { groen: 'bg-green-500', oranje: 'bg-amber-500', rood: 'bg-red-500' }

export function CmsManager() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cron, setCron] = useState<Cron | null>(null)
  const [ai, setAi] = useState<AiStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accRes, aiRes] = await Promise.all([fetch('/api/admin/blog-accounts'), fetch('/api/admin/ai-status')])
      const j = await accRes.json(); if (accRes.ok) { setAccounts(j.accounts ?? []); setCron(j.cron ?? null) }
      const a = await aiRes.json(); if (aiRes.ok) setAi(a)
    } catch { /* stil */ } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  if (loading) return <div className="card-base text-center py-10 text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>

  const sum = (k: keyof Account) => accounts.reduce((s, a) => s + (Number(a[k]) || 0), 0)
  const framerProjects = accounts.filter((a) => a.framer_valid).length
  const attention = accounts.filter((a) => a.health_status !== 'groen').length
  const allWarnings = accounts.flatMap((a) => a.warnings.map((w) => ({ account: a.name, id: a.id, w })))

  const kpis = [
    { label: 'Blogaccounts', value: accounts.length, color: 'text-gray-900' },
    { label: 'Framer-projecten', value: framerProjects, color: 'text-green-600' },
    { label: 'Blogs live', value: sum('published'), color: 'text-green-600' },
    { label: 'In review', value: sum('review'), color: 'text-amber-600' },
    { label: 'Met fouten', value: sum('failed'), color: 'text-red-600' },
    { label: 'Sync-problemen', value: sum('sync_problems'), color: 'text-orange-600' },
  ]

  return (
    <div className="space-y-5">
      {ai && (
        ai.hasKey ? (
          <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
            <Sparkles className="h-4 w-4 shrink-0" />AI actief — sleutel ingesteld ({ai.keyHint}), model <b>{ai.model}</b>. Blogs en analyses worden door AI gegenereerd.
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 shrink-0" />AI niet geconfigureerd — geen <code>ANTHROPIC_API_KEY</code> in deze omgeving. Blogs vallen terug op eenvoudige sjablonen. Stel de sleutel in (en laad tegoed op je Anthropic-account) en redeploy.
          </div>
        )
      )}
      {cron && !cron.ok && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />Automatische generatie (cron) lijkt niet recent gelopen{cron.lastRun ? ` (laatste: ${formatDate(cron.lastRun)})` : ''}.
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-100 p-3">
            <div className="text-[11px] text-gray-500">{k.label}</div>
            <div className={`mt-0.5 text-xl font-bold ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-gray-900 flex items-center gap-2"><Database className="h-4 w-4 text-gray-400" />Health per blogaccount {attention > 0 && <span className="status-badge bg-amber-100 text-amber-700 text-[10px]">{attention} aandacht</span>}</h2>
        <button onClick={load} className="btn-secondary text-xs"><RefreshCcw className="h-3.5 w-3.5" />Vernieuwen</button>
      </div>

      <div className="space-y-2">
        {accounts.map((a) => (
          <div key={a.id} className="card-base flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-medium flex items-center gap-2 flex-wrap">
                <span className={`h-2.5 w-2.5 rounded-full ${DOT[a.health_status]}`} />{a.name}
                <span className="text-xs text-gray-400">health {a.health_score}/100</span>
                {!a.active && <span className="status-badge bg-gray-100 text-gray-500 text-[10px]">inactief</span>}
                {a.client_name && <span className="status-badge bg-sky-100 text-sky-700 text-[10px]">{a.client_name}</span>}
                {a.website_changed && <span className="status-badge bg-amber-100 text-amber-700 text-[10px]">website gewijzigd</span>}
              </div>
              {a.warnings.length > 0 && (
                <ul className="mt-1.5 space-y-0.5">
                  {a.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-amber-700 flex items-center gap-1.5"><AlertTriangle className="h-3 w-3 shrink-0" />{w}</li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                <span className="status-badge bg-green-100 text-green-700">{a.published} live</span>
                <span className="status-badge bg-amber-100 text-amber-700">{a.review} review</span>
                {a.failed > 0 && <span className="status-badge bg-red-100 text-red-700">{a.failed} fout</span>}
                {a.sync_problems > 0 && <span className="status-badge bg-orange-100 text-orange-700">{a.sync_problems} sync</span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Link href={`/admin/blogs?account=${a.id}`} className="btn-secondary text-xs">Review</Link>
              <Link href="/admin/blogaccounts" className="btn-secondary text-xs">Beheer</Link>
              <Link href="/admin/framer" className="btn-secondary text-xs"><Plug className="h-3.5 w-3.5" /></Link>
            </div>
          </div>
        ))}
        {accounts.length === 0 && <div className="card-base empty-state"><p className="text-sm">Nog geen blogaccounts.</p></div>}
      </div>

      {allWarnings.length === 0 && accounts.length > 0 && (
        <div className="text-sm text-green-700 flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-green-500" />Alles gezond — geen openstaande waarschuwingen.</div>
      )}
    </div>
  )
}
