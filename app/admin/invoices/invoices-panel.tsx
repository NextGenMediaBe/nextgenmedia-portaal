'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, X, Loader2, Trash2, Link2, CalendarClock, Send, Repeat, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { formatEuro, SERVICE_LABELS } from '@/lib/utils'
import {
  INVOICE_STATUSES, INVOICE_STATUS_LABEL, INVOICE_STATUS_CLS, DEFAULT_VAT,
  inclFromExcl, monthLabel, thisMonthYM, shiftYM, type ExpandedRevenue,
} from '@/lib/invoices'

type Row = {
  rowId: string; kind: 'eenmalig' | 'recurring'; sourceId: string; month: string
  client_id: string | null; service_slug: string | null; description: string | null
  amount_excl: number; vat_pct: number; amount_incl: number; status: string; revenue_id: string | null
}
type ClientOpt = { id: string; company_name: string }
type Summary = { omzetExcl: number; linkedExcl: number; verschil: number; pct: number }

const SERVICE_OPTS = ['', 'social-media', 'webdesign', 'foto-video', 'grafisch-ontwerp', 'marketing-consultancy', 'ads']
const svcLabel = (s: string | null) => (s ? (SERVICE_LABELS[s] ?? s) : '—')

export function InvoicesPanel() {
  const [month, setMonth] = useState(thisMonthYM)
  const [rows, setRows] = useState<Row[]>([])
  const [omzet, setOmzet] = useState<ExpandedRevenue[]>([])
  const [clients, setClients] = useState<ClientOpt[]>([])
  const [summary, setSummary] = useState<Summary>({ omzetExcl: 0, linkedExcl: 0, verschil: 0, pct: 0 })
  const [billingDate, setBillingDate] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [fClient, setFClient] = useState(''); const [fService, setFService] = useState(''); const [fStatus, setFStatus] = useState(''); const [fType, setFType] = useState(''); const [fLinked, setFLinked] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/invoices?month=${month}`)
      const j = await res.json()
      if (res.ok) { setRows(j.rows ?? []); setOmzet(j.omzet ?? []); setClients(j.clients ?? []); setSummary(j.summary); setBillingDate(j.billingDate) }
    } catch { /* stil */ } finally { setLoading(false) }
  }, [month])
  useEffect(() => { load() }, [load])

  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.company_name])), [clients])
  const linkedRevenueIds = useMemo(() => new Set(rows.filter((r) => r.revenue_id).map((r) => r.revenue_id)), [rows])

  const filtered = rows.filter((r) =>
    (!fClient || r.client_id === fClient) &&
    (!fService || r.service_slug === fService) &&
    (!fStatus || r.status === fStatus) &&
    (!fType || r.kind === fType) &&
    (!fLinked || (fLinked === 'linked' ? !!r.revenue_id : !r.revenue_id))
  )

  const totals = useMemo(() => {
    const live = filtered.filter((r) => r.status !== 'geannuleerd')
    const excl = live.reduce((s, r) => s + r.amount_excl, 0)
    const incl = live.reduce((s, r) => s + r.amount_incl, 0)
    return { excl, incl, btw: incl - excl, teVersturen: filtered.filter((r) => r.status === 'te_versturen').length, verstuurd: filtered.filter((r) => r.status === 'verstuurd').length }
  }, [filtered])

  const setStatus = async (r: Row, status: string) => {
    setBusy(r.rowId)
    try { const res = await fetch('/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'status', kind: r.kind, source_id: r.sourceId, month: r.month, status }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }
  const link = async (r: Row, revenue_id: string) => {
    setBusy(r.rowId)
    try { const res = await fetch('/api/admin/invoices', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: r.kind, id: r.sourceId, revenue_id }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); await load() }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }
  const remove = async (r: Row) => {
    if (!confirm(r.kind === 'recurring' ? 'Recurring factuur (alle maanden) verwijderen?' : 'Factuur verwijderen?')) return
    setBusy(r.rowId)
    try { await fetch(`/api/admin/invoices?kind=${r.kind}&id=${r.sourceId}`, { method: 'DELETE' }); await load() } finally { setBusy(null) }
  }

  const suggestionFor = (r: Row): ExpandedRevenue | null => {
    if (r.revenue_id) return null
    return omzet.find((o) => !linkedRevenueIds.has(o.revenue_id) && o.client_id === r.client_id && o.service_slug === r.service_slug && Math.abs(o.amount_excl - r.amount_excl) < 0.01) ?? null
  }

  const pctColor = summary.pct >= 100 ? 'bg-green-500' : summary.pct > 0 ? 'bg-amber-500' : 'bg-red-500'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => setMonth((m) => shiftYM(m, -1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <span className="min-w-[150px] text-center text-sm font-semibold capitalize">{monthLabel(month)}</span>
          <button onClick={() => setMonth((m) => shiftYM(m, 1))} className="rounded-lg border border-gray-200 p-2 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          {month !== thisMonthYM() && <button onClick={() => setMonth(thisMonthYM())} className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Deze maand</button>}
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary text-sm"><Plus className="h-4 w-4" />Nieuwe factuur</button>
      </div>

      {billingDate && (
        <div className="inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5">
          <CalendarClock className="h-3.5 w-3.5" />Facturatie einde maand: {new Date(billingDate + 'T00:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })}
        </div>
      )}

      {/* Omzetkoppeling */}
      <div className="card-base">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Kpi label="Omzet geregistreerd" value={formatEuro(summary.omzetExcl)} sub="excl. btw" />
          <Kpi label="Gefactureerd (gekoppeld)" value={formatEuro(summary.linkedExcl)} sub="excl. btw" />
          <Kpi label="Nog niet gekoppeld" value={formatEuro(summary.verschil)} sub="excl. btw" />
          <Kpi label="Koppelingspercentage" value={`${summary.pct}%`} />
        </div>
        <div className="text-[11px] text-gray-500 mb-1">Omzet gekoppeld aan facturen</div>
        <div className="h-3 w-full rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${pctColor} transition-all`} style={{ width: `${summary.pct}%` }} /></div>
      </div>

      {/* Maandtotalen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <Kpi label="Totaal excl." value={formatEuro(totals.excl)} />
        <Kpi label="Totaal btw" value={formatEuro(totals.btw)} />
        <Kpi label="Totaal incl." value={formatEuro(totals.incl)} />
        <Kpi label="Te versturen" value={totals.teVersturen} />
        <Kpi label="Verstuurd" value={totals.verstuurd} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle klanten</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select>
        <select value={fService} onChange={(e) => setFService(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle diensten</option>{SERVICE_OPTS.filter(Boolean).map((s) => <option key={s} value={s}>{svcLabel(s)}</option>)}</select>
        <select value={fType} onChange={(e) => setFType(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle types</option><option value="eenmalig">Eenmalig</option><option value="recurring">Recurring</option></select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle statussen</option>{INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}</select>
        <select value={fLinked} onChange={(e) => setFLinked(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Gekoppeld + niet</option><option value="linked">Gekoppeld</option><option value="unlinked">Niet gekoppeld</option></select>
      </div>

      {/* Tabel */}
      <div className="card-base">
        {loading ? (
          <div className="py-10 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <p className="empty-state text-sm">Geen facturen voor deze selectie.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr className="border-b border-gray-100">
                <th className="table-th">Klant</th><th className="table-th">Type</th><th className="table-th">Dienst</th><th className="table-th">Omschrijving</th>
                <th className="table-th text-right">Excl.</th><th className="table-th text-right">Btw</th><th className="table-th text-right">Incl.</th>
                <th className="table-th">Koppeling</th><th className="table-th">Status</th><th className="table-th"></th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => {
                  const sug = suggestionFor(r)
                  return (
                    <tr key={r.rowId} className="hover:bg-gray-50/50">
                      <td className="table-td font-medium">{r.client_id ? (clientName.get(r.client_id) ?? '—') : '—'}</td>
                      <td className="table-td">
                        <span className={`status-badge text-[10px] inline-flex items-center gap-1 ${r.kind === 'recurring' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {r.kind === 'recurring' ? <><Repeat className="h-3 w-3" />Recurring</> : <><FileText className="h-3 w-3" />Eenmalig</>}
                        </span>
                      </td>
                      <td className="table-td text-gray-500 text-xs">{svcLabel(r.service_slug)}</td>
                      <td className="table-td text-gray-600 max-w-[180px] truncate">{r.description ?? '—'}</td>
                      <td className="table-td text-right">{formatEuro(r.amount_excl)}</td>
                      <td className="table-td text-right text-gray-500">{formatEuro(r.amount_incl - r.amount_excl)}</td>
                      <td className="table-td text-right font-medium">{formatEuro(r.amount_incl)}</td>
                      <td className="table-td">
                        {r.revenue_id ? <span className="inline-flex items-center gap-1 text-xs text-green-700"><Link2 className="h-3 w-3" />Gekoppeld</span>
                          : sug ? <button onClick={() => link(r, sug.revenue_id)} disabled={busy === r.rowId} className="text-xs inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"><Link2 className="h-3 w-3" />Koppelen</button>
                          : <span className="text-xs text-gray-300">niet gekoppeld</span>}
                      </td>
                      <td className="table-td">
                        <select value={r.status} onChange={(e) => setStatus(r, e.target.value)} disabled={busy === r.rowId} className="rounded-lg border border-gray-200 px-1.5 py-1 text-xs">
                          {INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}
                        </select>
                      </td>
                      <td className="table-td text-right whitespace-nowrap">
                        {r.status === 'te_versturen' && <button onClick={() => setStatus(r, 'verstuurd')} disabled={busy === r.rowId} className="btn-secondary text-xs mr-1" title="Markeer als verstuurd"><Send className="h-3.5 w-3.5" />Verstuurd</button>}
                        <button onClick={() => remove(r)} disabled={busy === r.rowId} className="text-gray-300 hover:text-red-500 align-middle" title="Verwijderen">{busy === r.rowId ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : <Trash2 className="h-3.5 w-3.5 inline" />}</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {creating && <CreateDialog month={month} clients={clients} omzet={omzet} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load() }} />}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return <div className="rounded-xl border border-gray-100 p-3"><div className="text-[11px] text-gray-500">{label}</div><div className="mt-0.5 text-lg font-bold">{value}</div>{sub && <div className="text-[10px] text-gray-400">{sub}</div>}</div>
}

function CreateDialog({ month, clients, omzet, onClose, onSaved }: { month: string; clients: ClientOpt[]; omzet: ExpandedRevenue[]; onClose: () => void; onSaved: () => void }) {
  const [type, setType] = useState<'eenmalig' | 'recurring'>('eenmalig')
  const [form, setForm] = useState({ client_id: '', service_slug: '', description: '', amount_excl: '', vat_pct: String(DEFAULT_VAT), status: 'te_versturen', revenue_id: '', start_month: month, end_month: '', active: true })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const excl = parseFloat(form.amount_excl) || 0
  const vat = parseFloat(form.vat_pct) || 0
  const incl = inclFromExcl(excl, vat)

  const submit = async () => {
    if (excl <= 0) { setError('Bedrag excl. btw is verplicht'); return }
    setLoading(true); setError(null)
    try {
      const body = type === 'recurring'
        ? { action: 'recurring', client_id: form.client_id, service_slug: form.service_slug, description: form.description, amount_excl: excl, vat_pct: vat, start_month: form.start_month, end_month: form.end_month || null, active: form.active, revenue_id: form.revenue_id }
        : { action: 'one_time', client_id: form.client_id, service_slug: form.service_slug, description: form.description, amount_excl: excl, vat_pct: vat, status: form.status, revenue_id: form.revenue_id, invoice_month: month }
      const res = await fetch('/api/admin/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setLoading(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold">Nieuwe factuur</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {(['eenmalig', 'recurring'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`rounded-xl border p-2.5 text-sm text-left transition-colors ${type === t ? 'border-[#fff848] bg-[#fff848]/10 ring-1 ring-[#fff848]' : 'border-gray-200 hover:border-gray-300'}`}>
                <div className="font-medium flex items-center gap-1.5">{t === 'recurring' ? <Repeat className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}{t === 'recurring' ? 'Recurring' : 'Eenmalig'}</div>
                <div className="text-[10px] text-gray-500">{t === 'recurring' ? 'Elke maand automatisch' : 'Ad hoc, één maand'}</div>
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Klant</label>
            <select className={inp} value={form.client_id} onChange={(e) => setForm((f) => ({ ...f, client_id: e.target.value }))}><option value="">— Kies klant —</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Dienst</label>
            <select className={inp} value={form.service_slug} onChange={(e) => setForm((f) => ({ ...f, service_slug: e.target.value }))}>{SERVICE_OPTS.map((s) => <option key={s || 'none'} value={s}>{s ? svcLabel(s) : '— Geen —'}</option>)}</select>
          </div>

          {type === 'recurring' ? (
            <div className="grid grid-cols-2 gap-3">
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Startmaand</label><input type="month" className={inp} value={form.start_month} onChange={(e) => setForm((f) => ({ ...f, start_month: e.target.value }))} /></div>
              <div><label className="block text-xs font-medium text-gray-600 mb-1">Eindmaand (optioneel)</label><input type="month" className={inp} value={form.end_month} onChange={(e) => setForm((f) => ({ ...f, end_month: e.target.value }))} /></div>
            </div>
          ) : null}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Omschrijving</label>
            <input className={inp} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Bv. Social media maandelijks" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Bedrag excl. btw {type === 'recurring' ? '/ maand' : ''} (€)</label><input type="number" min="0" step="0.01" className={inp} value={form.amount_excl} onChange={(e) => setForm((f) => ({ ...f, amount_excl: e.target.value }))} placeholder="1000" /></div>
            <div><label className="block text-xs font-medium text-gray-600 mb-1">BTW %</label><input type="number" min="0" step="1" className={inp} value={form.vat_pct} onChange={(e) => setForm((f) => ({ ...f, vat_pct: e.target.value }))} /></div>
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2 text-sm flex items-center justify-between">
            <span className="text-gray-500">Btw {formatEuro(incl - excl)} · Incl. btw</span><span className="font-bold">{formatEuro(incl)}</span>
          </div>

          {type === 'eenmalig' && (
            <div><label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select className={inp} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>{INVOICE_STATUSES.map((s) => <option key={s} value={s}>{INVOICE_STATUS_LABEL[s]}</option>)}</select>
            </div>
          )}
          {type === 'recurring' && (
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />Actief</label>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Koppel aan omzetrecord (optioneel)</label>
            <select className={inp} value={form.revenue_id} onChange={(e) => setForm((f) => ({ ...f, revenue_id: e.target.value }))}>
              <option value="">— Geen koppeling —</option>
              {omzet.map((r) => <option key={r.revenue_id} value={r.revenue_id}>{(r.title || 'Omzet')} · {svcLabel(r.service_slug)} · {formatEuro(r.amount_excl)}</option>)}
            </select>
          </div>
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submit} disabled={loading} className="btn-primary flex-1 justify-center">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Aanmaken</button>
            <button onClick={onClose} className="btn-secondary">Annuleer</button>
          </div>
        </div>
      </div>
    </div>
  )
}
