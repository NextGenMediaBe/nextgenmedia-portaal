'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Briefcase } from 'lucide-react'
import { formatDate, formatEuro } from '@/lib/utils'

type Assignment = {
  id: string; title: string; description: string | null;
  service_slug: string | null; roles?: string[];
  status: string; budget: number | null; deadline: string | null;
  client_id: string | null; freelancer_id: string | null;
  created_at: string;
  freelancers: { id: string; name: string; email: string } | null;
  clients: { id: string; company_name: string } | null;
}
type Partner = { id: string; name: string; email: string; roles: string[] }
type Client = { id: string; company_name: string }

const STATUS_STYLE: Record<string, string> = {
  open: 'bg-orange-100 text-orange-700',
  in_progress: 'bg-blue-100 text-blue-700',
  completed: 'bg-green-100 text-green-700',
  cancelled: 'bg-gray-100 text-gray-500',
}
const STATUS_LABEL: Record<string, string> = {
  open: 'Open', in_progress: 'Actief', completed: 'Afgerond', cancelled: 'Geannuleerd',
}

const ALL_ROLES = ['photographer', 'videographer', 'editor', 'designer', 'copywriter', 'developer', 'strategist', 'other']
const SERVICES_FOR_ASSIGNMENT = [
  { slug: '', label: '— Geen specifieke dienst —' },
  { slug: 'social-media', label: 'Social Media' },
  { slug: 'webdesign', label: 'Website' },
  { slug: 'foto-video', label: 'Foto & Videografie' },
  { slug: 'grafisch-ontwerp', label: 'Grafisch Ontwerp' },
  { slug: 'marketing-consultancy', label: 'Marketing Consultancy' },
  { slug: 'ads', label: 'Google Advertising' },
]

function CreateDialog({
  partners, clients, roleLabels, onClose, onCreated,
}: {
  partners: Partner[]
  clients: Client[]
  roleLabels: Record<string, string>
  onClose: () => void
  onCreated: (a: Assignment) => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    description: '',
    roles: [] as string[],
    service_slug: '',
    client_id: '',
    freelancer_id: '',
    budget: '',
    deadline: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.roles.length === 0) { setError('Selecteer minstens één rol'); return }
    if (!form.title.trim()) { setError('Titel is verplicht'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          roles: form.roles,
          service_slug: form.service_slug || null,
          client_id: form.client_id || null,
          freelancer_id: form.freelancer_id || null,
          budget: form.budget ? parseFloat(form.budget) : null,
          deadline: form.deadline || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Mislukt')
      onCreated({
        id: json.id,
        title: form.title,
        description: form.description || null,
        service_slug: form.service_slug || null,
        roles: form.roles,
        status: 'open',
        budget: form.budget ? parseFloat(form.budget) : null,
        client_id: form.client_id || null,
        freelancer_id: form.freelancer_id || null,
        deadline: form.deadline || null,
        created_at: new Date().toISOString(),
        freelancers: form.freelancer_id ? partners.find(p => p.id === form.freelancer_id) ?? null : null,
        clients: form.client_id ? clients.find(c => c.id === form.client_id) ?? null : null,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold">Nieuwe opdracht</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className={lbl}>Titel *</label>
            <input required className={inp} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Omschrijving</label>
            <textarea rows={3} className={inp} value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Rollen *</label>
            <div className="grid grid-cols-4 gap-1.5 mt-1">
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setForm((p) => ({
                    ...p,
                    roles: p.roles.includes(r) ? p.roles.filter((x) => x !== r) : [...p.roles, r],
                  }))}
                  className={`px-2 py-1.5 rounded-lg border text-xs transition-colors ${
                    form.roles.includes(r)
                      ? 'border-[#fff848] bg-[#fff848]/10 text-black'
                      : 'border-gray-200 text-gray-500'
                  }`}
                >
                  {roleLabels[r] ?? r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Dienst (optioneel)</label>
            <select className={inp} value={form.service_slug} onChange={(e) => setForm((p) => ({ ...p, service_slug: e.target.value }))}>
              {SERVICES_FOR_ASSIGNMENT.map((s) => (
                <option key={s.slug || 'none'} value={s.slug}>{s.label}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Klant</label>
              <select className={inp} value={form.client_id} onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}>
                <option value="">— Geen —</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Partner</label>
              <select className={inp} value={form.freelancer_id} onChange={(e) => setForm((p) => ({ ...p, freelancer_id: e.target.value }))}>
                <option value="">— Open pool —</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Budget / payout (€)</label>
              <input type="number" min="0" step="0.01" className={inp} value={form.budget} onChange={(e) => setForm((p) => ({ ...p, budget: e.target.value }))} />
            </div>
            <div>
              <label className={lbl}>Deadline</label>
              <input type="date" className={inp} value={form.deadline} onChange={(e) => setForm((p) => ({ ...p, deadline: e.target.value }))} />
            </div>
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Aanmaken
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function AssignmentsClient({
  initialAssignments, partners, clients, roleLabels,
}: {
  initialAssignments: Assignment[]
  partners: Partner[]
  clients: Client[]
  roleLabels: Record<string, string>
}) {
  const router = useRouter()
  const [assignments, setAssignments] = useState(initialAssignments)
  const [showCreate, setShowCreate] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('all')

  const filtered = filterStatus === 'all'
    ? assignments
    : assignments.filter((a) => a.status === filterStatus)

  const statusCounts = ['open', 'in_progress', 'completed', 'cancelled'].map((s) => ({
    status: s,
    count: assignments.filter((a) => a.status === s).length,
  }))

  const updateStatus = async (id: string, status: string) => {
    try {
      const res = await fetch('/api/admin/assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setAssignments((prev) => prev.map((a) => a.id === id ? { ...a, status } : a))
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout bij statusupdate')
    }
  }

  return (
    <div className="space-y-4">
      {/* Stats + filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === 'all' ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
          >
            Alles ({assignments.length})
          </button>
          {statusCounts.map(({ status, count }) => (
            <button
              key={status}
              onClick={() => setFilterStatus(status)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${filterStatus === status ? 'bg-black text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
            >
              {STATUS_LABEL[status]} ({count})
            </button>
          ))}
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="h-4 w-4" />
          Nieuwe opdracht
        </button>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Geen opdrachten gevonden</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="table-th">Titel</th>
                <th className="table-th">Partner</th>
                <th className="table-th">Klant</th>
                <th className="table-th">Budget</th>
                <th className="table-th">Deadline</th>
                <th className="table-th">Status</th>
                <th className="table-th">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="table-td">
                    <div className="font-medium">{a.title}</div>
                    {a.description && (
                      <div className="text-xs text-gray-400 truncate max-w-[200px]">{a.description}</div>
                    )}
                    <div className="flex gap-1 mt-1">
                      {(a.roles?.length ? a.roles : a.service_slug ? [a.service_slug] : []).slice(0, 2).map((r) => (
                        <span key={r} className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                          {roleLabels[r] ?? r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="table-td text-sm">
                    {a.freelancers?.name ?? <span className="text-gray-400 text-xs">Open pool</span>}
                  </td>
                  <td className="table-td text-sm text-gray-500">
                    {a.clients?.company_name ?? '—'}
                  </td>
                  <td className="table-td">{a.budget ? formatEuro(a.budget) : '—'}</td>
                  <td className="table-td text-gray-500">{a.deadline ? formatDate(a.deadline) : '—'}</td>
                  <td className="table-td">
                    <span className={`status-badge ${STATUS_STYLE[a.status] ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_LABEL[a.status] ?? a.status}
                    </span>
                  </td>
                  <td className="table-td">
                    {a.status === 'in_progress' && (
                      <button
                        onClick={() => updateStatus(a.id, 'completed')}
                        className="text-xs text-green-600 hover:underline"
                      >
                        Afgerond
                      </button>
                    )}
                    {(a.status === 'open' || a.status === 'in_progress') && (
                      <button
                        onClick={() => updateStatus(a.id, 'cancelled')}
                        className="text-xs text-red-500 hover:underline ml-2"
                      >
                        Annuleer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateDialog
          partners={partners}
          clients={clients}
          roleLabels={roleLabels}
          onClose={() => setShowCreate(false)}
          onCreated={(a) => { setAssignments((prev) => [a, ...prev]); setShowCreate(false) }}
        />
      )}
    </div>
  )
}
