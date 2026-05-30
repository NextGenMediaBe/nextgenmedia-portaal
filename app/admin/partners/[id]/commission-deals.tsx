'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, HandCoins, Pencil, Trash2, Sparkles } from 'lucide-react'
import { formatEuro, formatDate, SERVICE_LABELS, commissionYearForDate, commissionAmountForYear, commissionPctForYear } from '@/lib/utils'

type Client = { id: string; company_name: string; customer_since: string | null }
export type CommissionDeal = {
  id: string
  client_id: string | null
  label: string | null
  service_slug: string | null
  contract_value: number
  start_date: string
  pct_year_1: number
  pct_year_2: number
  pct_year_3: number
  status: string
  notes: string | null
  created_at: string
}

// Which years already have a generated commission ledger entry
type GeneratedMap = Record<string, Set<number>> // dealId -> set of years

export function CommissionDeals({
  partnerId,
  clients,
  deals,
  generated,
}: {
  partnerId: string
  clients: Client[]
  deals: CommissionDeal[]
  generated: GeneratedMap
}) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<CommissionDeal | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const clientName = (d: CommissionDeal) =>
    d.client_id ? (clients.find((c) => c.id === d.client_id)?.company_name ?? d.label ?? 'Klant') : (d.label ?? 'Lead')

  const generateYear = async (deal: CommissionDeal, year: number) => {
    setBusy(`${deal.id}-${year}`)
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/commission-deals`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: deal.id, action: 'generate_year', year }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout')
    } finally {
      setBusy(null)
    }
  }

  const removeDeal = async (deal: CommissionDeal) => {
    if (!confirm(`Commissiedeal voor "${clientName(deal)}" verwijderen?`)) return
    setBusy(deal.id)
    try {
      const res = await fetch(`/api/admin/partners/${partnerId}/commission-deals?deal_id=${deal.id}`, { method: 'DELETE' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      router.refresh()
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Fout')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="card-base">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-[#c5b800]" />
            Commissiedeals
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">Aangeleverde klanten — commissie daalt per actief jaar van die klant</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-secondary text-xs">
          <Plus className="h-3.5 w-3.5" />
          Nieuwe deal
        </button>
      </div>

      {deals.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          <HandCoins className="h-7 w-7 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nog geen commissiedeals</p>
        </div>
      ) : (
        <div className="space-y-3">
          {deals.map((deal) => {
            // Commission year is based on how long the CLIENT has been with us
            // (customer_since), falling back to the deal start date for leads
            // without a linked client.
            const client = deal.client_id ? clients.find((c) => c.id === deal.client_id) : null
            const refDate = client?.customer_since ?? deal.start_date
            const currentYear = commissionYearForDate(refDate)
            const genYears = generated[deal.id] ?? new Set<number>()
            return (
              <div key={deal.id} className="border border-gray-200 rounded-xl p-4">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
                      {clientName(deal)}
                      {deal.service_slug && (
                        <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
                          {SERVICE_LABELS[deal.service_slug] ?? deal.service_slug}
                        </span>
                      )}
                      <span className={`status-badge text-xs ${deal.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {deal.status === 'active' ? 'Actief' : 'Beëindigd'}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Contractwaarde {formatEuro(deal.contract_value)}/jaar
                      {' · '}
                      {client?.customer_since
                        ? `Klant sinds ${formatDate(client.customer_since)}`
                        : `Start ${formatDate(deal.start_date)}`}
                      {' · '}
                      <span className="font-medium text-gray-600">Nu jaar {currentYear}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => setEditing(deal)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" title="Bewerken">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => removeDeal(deal)} disabled={busy === deal.id} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400" title="Verwijderen">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Year breakdown */}
                <div className="grid grid-cols-3 gap-2">
                  {[1, 2, 3].map((year) => {
                    const pct = commissionPctForYear(deal, year)
                    const amount = commissionAmountForYear(deal, year)
                    const isGenerated = genYears.has(year)
                    const isCurrent = currentYear === year
                    return (
                      <div
                        key={year}
                        className={`rounded-lg border p-2.5 text-center ${
                          isCurrent ? 'border-[#fff848] bg-[#fff848]/10' : 'border-gray-200'
                        }`}
                      >
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide">Jaar {year}</div>
                        <div className="text-sm font-bold">{pct}%</div>
                        <div className="text-xs text-gray-600 mb-1.5">{formatEuro(amount)}</div>
                        {isGenerated ? (
                          <span className="text-[10px] text-green-600 font-medium">✓ Aangemaakt</span>
                        ) : (
                          <button
                            onClick={() => generateYear(deal, year)}
                            disabled={busy === `${deal.id}-${year}` || amount <= 0}
                            className="text-[10px] text-blue-600 hover:underline font-medium disabled:opacity-40 inline-flex items-center gap-0.5"
                          >
                            {busy === `${deal.id}-${year}` ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Sparkles className="h-2.5 w-2.5" />}
                            Genereer
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
                {deal.notes && <p className="text-xs text-gray-400 mt-2">{deal.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      {(showCreate || editing) && (
        <DealDialog
          partnerId={partnerId}
          clients={clients}
          deal={editing}
          onClose={() => { setShowCreate(false); setEditing(null) }}
          onSaved={() => { setShowCreate(false); setEditing(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DealDialog({
  partnerId, clients, deal, onClose, onSaved,
}: {
  partnerId: string
  clients: Client[]
  deal: CommissionDeal | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!deal
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    client_id: deal?.client_id ?? '',
    label: deal?.label ?? '',
    service_slug: deal?.service_slug ?? '',
    contract_value: deal ? String(deal.contract_value) : '',
    start_date: deal?.start_date ?? new Date().toISOString().slice(0, 10),
    pct_year_1: deal ? String(deal.pct_year_1) : '10',
    pct_year_2: deal ? String(deal.pct_year_2) : '8',
    pct_year_3: deal ? String(deal.pct_year_3) : '5',
    notes: deal?.notes ?? '',
  })

  const SERVICES = [
    { slug: '', label: '— Geen dienst —' },
    { slug: 'social-media', label: 'Social Media' },
    { slug: 'webdesign', label: 'Website' },
    { slug: 'foto-video', label: 'Foto & Videografie' },
    { slug: 'grafisch-ontwerp', label: 'Grafisch Ontwerp' },
    { slug: 'marketing-consultancy', label: 'Marketing Consultancy' },
    { slug: 'ads', label: 'Google Advertising' },
  ]

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.contract_value || parseFloat(form.contract_value) <= 0) { setError('Contractwaarde is verplicht'); return }
    if (!form.client_id && !form.label.trim()) { setError('Kies een klant of geef een naam op'); return }
    setLoading(true)
    try {
      const payload = {
        client_id: form.client_id || null,
        label: form.label || null,
        service_slug: form.service_slug || null,
        contract_value: parseFloat(form.contract_value),
        start_date: form.start_date,
        pct_year_1: parseFloat(form.pct_year_1) || 0,
        pct_year_2: parseFloat(form.pct_year_2) || 0,
        pct_year_3: parseFloat(form.pct_year_3) || 0,
        notes: form.notes || null,
      }
      const res = await fetch(`/api/admin/partners/${partnerId}/commission-deals`, {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { deal_id: deal!.id, ...payload } : payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold">{isEdit ? 'Commissiedeal bewerken' : 'Nieuwe commissiedeal'}</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className={lbl}>Klant (bestaand)</label>
            <select className={inp} value={form.client_id} onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}>
              <option value="">— Of geef hieronder een naam op —</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
            </select>
          </div>
          {!form.client_id && (
            <div>
              <label className={lbl}>Naam lead / klant</label>
              <input className={inp} value={form.label} onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))} placeholder="Bv. Bakkerij Janssens" />
            </div>
          )}
          <div>
            <label className={lbl}>Dienst</label>
            <select className={inp} value={form.service_slug} onChange={(e) => setForm((p) => ({ ...p, service_slug: e.target.value }))}>
              {SERVICES.map((s) => <option key={s.slug || 'none'} value={s.slug}>{s.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Contractwaarde / jaar (€)</label>
              <input type="number" min="0" step="0.01" className={inp} value={form.contract_value} onChange={(e) => setForm((p) => ({ ...p, contract_value: e.target.value }))} placeholder="6000" />
            </div>
            <div>
              <label className={lbl}>Startdatum</label>
              <input type="date" className={inp} value={form.start_date} onChange={(e) => setForm((p) => ({ ...p, start_date: e.target.value }))} />
            </div>
          </div>
          <div>
            <label className={lbl}>Commissie per jaar (%)</label>
            <div className="grid grid-cols-3 gap-2">
              {([['pct_year_1', 'Jaar 1'], ['pct_year_2', 'Jaar 2'], ['pct_year_3', 'Jaar 3']] as const).map(([key, label]) => (
                <div key={key}>
                  <span className="block text-[10px] text-gray-400 mb-0.5">{label}</span>
                  <input
                    type="number" min="0" max="100" step="0.5"
                    className={inp}
                    value={form[key]}
                    onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <div>
            <label className={lbl}>Notities</label>
            <textarea rows={2} className={inp} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
              {isEdit ? 'Opslaan' : 'Deal aanmaken'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </form>
      </div>
    </div>
  )
}
