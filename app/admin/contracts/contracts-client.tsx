'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, Filter as FilterIcon, X, Search, Bell } from 'lucide-react'
import { formatDate, SERVICE_LABELS } from '@/lib/utils'
import { statusInfo, canonicalStatus, STATUS_FILTER_OPTIONS, followUp, averageSignDays } from '@/lib/contract-status'
import { ContractTabs } from './contract-tabs'

type Contract = {
  id: string
  title: string
  status: string
  service_slug: string | null
  signed_at: string | null
  sent_at: string | null
  created_at: string
  expires_at: string | null
  access_token: string
  client_id: string | null
  template_id: string | null
  signer_name: string | null
  signer_email: string | null
  client: { id: string; company_name: string } | null
}

type Client = { id: string; company_name: string }
type Template = { id: string; name: string }

const ALL_SERVICES = ['social-media', 'webdesign', 'foto-video', 'grafisch-ontwerp', 'marketing-consultancy', 'ads']

export function ContractsClient({
  initialContracts, clients, templates = [], initialStatus = 'all',
}: {
  initialContracts: Contract[]
  clients: Client[]
  templates?: Template[]
  initialStatus?: string
}) {
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>(initialStatus)
  const [filterTemplate, setFilterTemplate] = useState<string>('all')
  const [query, setQuery] = useState('')

  const templateName = useMemo(() => new Map(templates.map((t) => [t.id, t.name])), [templates])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initialContracts.filter((c) => {
      if (filterClient !== 'all' && c.client_id !== filterClient) return false
      if (filterService !== 'all' && (c.service_slug ?? '') !== filterService) return false
      if (filterStatus !== 'all' && canonicalStatus(c.status) !== filterStatus) return false
      if (filterTemplate !== 'all') {
        if (filterTemplate === 'none' ? !!c.template_id : c.template_id !== filterTemplate) return false
      }
      if (q) {
        const hay = [
          c.title, c.client?.company_name, c.signer_name, c.signer_email,
          c.service_slug, statusInfo(c.status).label, c.template_id ? templateName.get(c.template_id) : '',
        ].filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [initialContracts, filterClient, filterService, filterStatus, filterTemplate, query, templateName])

  // ── Dashboard-cijfers (over alle contracten) ───────────────────────────────
  const stats = useMemo(() => {
    const todayISO = new Date().toISOString().slice(0, 10)
    const key = (c: Contract) => canonicalStatus(c.status)
    return {
      open:      initialContracts.filter((c) => !['getekend', 'geannuleerd'].includes(key(c))).length,
      sentToday: initialContracts.filter((c) => c.sent_at && String(c.sent_at).slice(0, 10) === todayISO).length,
      toSign:    initialContracts.filter((c) => ['verzonden', 'geopend', 'ingevuld'].includes(key(c))).length,
      expired:   initialContracts.filter((c) => key(c) === 'verlopen').length,
      signed:    initialContracts.filter((c) => key(c) === 'getekend').length,
      avgDays:   averageSignDays(initialContracts),
    }
  }, [initialContracts])

  const followUps = useMemo(
    () => initialContracts.map((c) => ({ c, fu: followUp(c) })).filter((x) => x.fu.needs)
      .sort((a, b) => (a.fu.level === 'urgent' ? -1 : 1) - (b.fu.level === 'urgent' ? -1 : 1)),
    [initialContracts],
  )

  const hasActiveFilters = filterClient !== 'all' || filterService !== 'all' || filterStatus !== 'all' || filterTemplate !== 'all' || query.trim() !== ''

  const clearFilters = () => {
    setFilterClient('all')
    setFilterService('all')
    setFilterStatus('all')
    setFilterTemplate('all')
    setQuery('')
  }

  // Stat-kaart klik → filtert de lijst op die status.
  const filterByKey = (key: string) => { clearFilters(); setFilterStatus(key) }

  const sel = 'px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'

  return (
    <div className="space-y-6 animate-fade-in">
      <ContractTabs />
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Contracten</h1>
          <p className="text-sm text-gray-500 mt-0.5">{filtered.length} van {initialContracts.length} contracten</p>
        </div>
        <Link href="/admin/contracts/new" className="btn-primary shrink-0">
          <Plus className="h-4 w-4" />
          Nieuw contract
        </Link>
      </div>

      {/* Dashboard — klikbare cijfers */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <button onClick={() => clearFilters()} className="stat-card text-left hover:ring-2 hover:ring-gray-200">
          <div className="text-2xl font-bold">{stats.open}</div>
          <div className="text-xs text-gray-400 mt-1">Openstaand</div>
        </button>
        <button onClick={() => filterByKey('verzonden')} className="stat-card text-left hover:ring-2 hover:ring-gray-200">
          <div className="text-2xl font-bold text-blue-600">{stats.sentToday}</div>
          <div className="text-xs text-gray-400 mt-1">Vandaag verzonden</div>
        </button>
        <button onClick={() => filterByKey('verzonden')} className="stat-card text-left hover:ring-2 hover:ring-gray-200">
          <div className="text-2xl font-bold text-amber-600">{stats.toSign}</div>
          <div className="text-xs text-gray-400 mt-1">Nog te tekenen</div>
        </button>
        <button onClick={() => filterByKey('verlopen')} className="stat-card text-left hover:ring-2 hover:ring-gray-200">
          <div className="text-2xl font-bold text-red-600">{stats.expired}</div>
          <div className="text-xs text-gray-400 mt-1">Verlopen</div>
        </button>
        <button onClick={() => filterByKey('getekend')} className="stat-card text-left hover:ring-2 hover:ring-gray-200">
          <div className="text-2xl font-bold text-green-600">{stats.signed}</div>
          <div className="text-xs text-gray-400 mt-1">Getekend</div>
        </button>
        <div className="stat-card">
          <div className="text-2xl font-bold">{stats.avgDays !== null ? `${stats.avgDays}d` : '—'}</div>
          <div className="text-xs text-gray-400 mt-1">Gem. tekentijd</div>
        </div>
      </div>

      {/* Reminders — opvolging vereist (geen automail) */}
      {followUps.length > 0 && (
        <div className="card-base border-amber-200 bg-amber-50/40">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Contracten vereisen opvolging ({followUps.length})</h2>
          </div>
          <div className="space-y-1.5">
            {followUps.slice(0, 6).map(({ c, fu }) => (
              <Link key={c.id} href={`/admin/contracts/${c.id}`} className="flex items-center justify-between gap-2 py-1.5 px-2 rounded-lg hover:bg-white/70">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.title}</div>
                  <div className="text-xs text-gray-500">{c.client?.company_name ?? c.signer_name ?? '—'}</div>
                </div>
                <span className={`status-badge shrink-0 ${fu.level === 'urgent' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{fu.reason}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-base">
        <div className="flex items-center gap-2 mb-3">
          <FilterIcon className="h-4 w-4 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-700">Filters</h2>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="ml-auto text-xs text-gray-500 hover:text-black flex items-center gap-1">
              <X className="h-3 w-3" />
              Reset
            </button>
          )}
        </div>
        {/* Zoeken */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Zoek op titel, klant, ontvanger, e-mail, type, status…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]"
          />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Klant</label>
            <select className={`${sel} w-full`} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
              <option value="all">Alle klanten</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.company_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dienst</label>
            <select className={`${sel} w-full`} value={filterService} onChange={(e) => setFilterService(e.target.value)}>
              <option value="all">Alle diensten</option>
              {ALL_SERVICES.map((s) => (
                <option key={s} value={s}>{SERVICE_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select className={`${sel} w-full`} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">Alle statussen</option>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Template</label>
            <select className={`${sel} w-full`} value={filterTemplate} onChange={(e) => setFilterTemplate(e.target.value)}>
              <option value="all">Alle types</option>
              <option value="none">Zonder template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <FileText className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">
              {initialContracts.length === 0 ? 'Nog geen contracten' : 'Geen contracten matchen de filters'}
            </p>
            {initialContracts.length === 0 && (
              <Link href="/admin/contracts/new" className="btn-primary mt-4 inline-flex">
                <Plus className="h-4 w-4" />
                Eerste contract aanmaken
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Contract</th>
                <th className="table-th">Klant</th>
                <th className="table-th">Dienst</th>
                <th className="table-th">Status</th>
                <th className="table-th">Datum</th>
                <th className="table-th">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((c) => {
                const style = statusInfo(c.status)
                return (
                  <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                    <td className="table-td">
                      <Link href={`/admin/contracts/${c.id}`} className="font-medium hover:text-black">
                        {c.title}
                      </Link>
                    </td>
                    <td className="table-td">
                      {c.client ? (
                        <Link href={`/admin/clients/${c.client.id}`} className="text-gray-600 hover:text-black">
                          {c.client.company_name}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="table-td">
                      {c.service_slug ? (
                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          {SERVICE_LABELS[c.service_slug] ?? c.service_slug}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>
                    <td className="table-td">
                      <span className={`status-badge ${style.cls}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="table-td text-gray-500">
                      {c.signed_at
                        ? formatDate(c.signed_at)
                        : c.sent_at
                        ? formatDate(c.sent_at)
                        : formatDate(c.created_at)}
                    </td>
                    <td className="table-td">
                      <div className="flex items-center gap-2">
                        <Link href={`/admin/contracts/${c.id}`} className="text-xs text-gray-500 hover:text-black underline">
                          Bekijken
                        </Link>
                        {['verzonden', 'geopend'].includes(canonicalStatus(c.status)) && (
                          <a
                            href={`/sign/${c.access_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Signelink
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  )
}
