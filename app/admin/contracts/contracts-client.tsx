'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, CheckCircle2, Clock, Eye, ScrollText, Filter as FilterIcon, X } from 'lucide-react'
import { formatDate, SERVICE_LABELS } from '@/lib/utils'

type Contract = {
  id: string
  title: string
  status: string
  service_slug: string | null
  signed_at: string | null
  sent_at: string | null
  created_at: string
  access_token: string
  client_id: string | null
  client: { id: string; company_name: string } | null
}

type Client = { id: string; company_name: string }

const STATUS_STYLE: Record<string, { cls: string; label: string; icon: React.ComponentType<{ className?: string }> }> = {
  draft:      { cls: 'bg-gray-100 text-gray-600',    label: 'Concept',      icon: FileText },
  sent:       { cls: 'bg-blue-100 text-blue-700',    label: 'Verstuurd',    icon: Clock },
  viewed:     { cls: 'bg-amber-100 text-amber-700',  label: 'Bekeken',      icon: Eye },
  signed:     { cls: 'bg-green-100 text-green-700',  label: 'Getekend',     icon: CheckCircle2 },
  expired:    { cls: 'bg-red-100 text-red-700',      label: 'Verlopen',     icon: FileText },
  cancelled:  { cls: 'bg-gray-100 text-gray-500',    label: 'Geannuleerd',  icon: FileText },
  vervangen:  { cls: 'bg-orange-100 text-orange-700', label: 'Vervangen',   icon: FileText },
}

const ALL_SERVICES = ['social-media', 'webdesign', 'foto-video', 'grafisch-ontwerp', 'marketing-consultancy', 'ads']

export function ContractsClient({
  initialContracts, clients,
}: {
  initialContracts: Contract[]
  clients: Client[]
}) {
  const [filterClient, setFilterClient] = useState<string>('all')
  const [filterService, setFilterService] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filtered = useMemo(() => {
    return initialContracts.filter((c) => {
      if (filterClient !== 'all' && c.client_id !== filterClient) return false
      if (filterService !== 'all' && (c.service_slug ?? '') !== filterService) return false
      if (filterStatus !== 'all' && c.status !== filterStatus) return false
      return true
    })
  }, [initialContracts, filterClient, filterService, filterStatus])

  const byStatus = useMemo(() => ({
    pending: filtered.filter((c) => ['sent', 'viewed'].includes(c.status)).length,
    signed:  filtered.filter((c) => c.status === 'signed').length,
    other:   filtered.filter((c) => ['draft', 'expired', 'cancelled', 'vervangen'].includes(c.status)).length,
  }), [filtered])

  const hasActiveFilters = filterClient !== 'all' || filterService !== 'all' || filterStatus !== 'all'

  const clearFilters = () => {
    setFilterClient('all')
    setFilterService('all')
    setFilterStatus('all')
  }

  const sel = 'px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'

  return (
    <div className="space-y-6 animate-fade-in">
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
        <div className="grid sm:grid-cols-3 gap-3">
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
              {Object.entries(STATUS_STYLE).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card text-center">
          <div className="text-2xl font-bold text-amber-600">{byStatus.pending}</div>
          <div className="text-xs text-gray-400 mt-1">Wachten op handtekening</div>
        </div>
        <div className="stat-card text-center">
          <div className="text-2xl font-bold text-green-600">{byStatus.signed}</div>
          <div className="text-xs text-gray-400 mt-1">Getekend</div>
        </div>
        <div className="stat-card text-center">
          <div className="text-2xl font-bold text-gray-600">{byStatus.other}</div>
          <div className="text-xs text-gray-400 mt-1">Concept / Verlopen</div>
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
                const style = STATUS_STYLE[c.status] ?? STATUS_STYLE.draft
                const Icon = style.icon
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
                      <span className={`status-badge ${style.cls} gap-1`}>
                        <Icon className="h-3 w-3" />
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
                        {['sent', 'viewed'].includes(c.status) && (
                          <a
                            href={`/sign/${c.access_token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-blue-600 hover:underline"
                          >
                            Signelink
                          </a>
                        )}
                        {c.status === 'signed' && (
                          <Link
                            href={`/admin/contracts/${c.id}/addendum`}
                            className="text-xs text-green-600 hover:underline flex items-center gap-1"
                          >
                            <ScrollText className="h-3 w-3" />
                            Addendum
                          </Link>
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
