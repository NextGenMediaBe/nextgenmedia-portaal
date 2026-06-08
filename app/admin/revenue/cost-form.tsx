'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, X, Loader2, Repeat2, ArrowDownRight } from 'lucide-react'

type CostType = 'one_time' | 'recurring'
type Freq = 'monthly' | 'quarterly' | 'annual'

const FREQ_OPTIONS: { value: Freq; label: string }[] = [
  { value: 'monthly', label: 'Maandelijks' },
  { value: 'quarterly', label: 'Per kwartaal' },
  { value: 'annual', label: 'Jaarlijks' },
]

const CATEGORIES = [
  'Software & Tools', 'Freelancers / Onderaanneming', 'Lonen', 'Marketing & Advertenties',
  'Kantoor & Huur', 'Materiaal & Apparatuur', 'Verzekeringen', 'Boekhouding & Juridisch',
  'Verplaatsing', 'Opleiding', 'Bankkosten', 'Overig',
]

export function CostForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [type, setType] = useState<CostType>('one_time')

  const today = new Date().toISOString().slice(0, 10)
  const [form, setForm] = useState({
    name: '', category: '', amount_excl: '', vat_pct: '21',
    cost_date: today, start_date: today, end_date: '', billing_frequency: 'monthly' as Freq, notes: '',
  })

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#fff848]/50 focus:border-[#fff848]'
  const lbl = 'block text-xs font-medium text-gray-600 mb-1'

  const excl = parseFloat(form.amount_excl) || 0
  const vat = parseFloat(form.vat_pct) || 0
  const incl = excl * (1 + vat / 100)
  const fmt = (n: number) => new Intl.NumberFormat('nl-BE', { style: 'currency', currency: 'EUR' }).format(n)

  const reset = () => {
    setForm({ name: '', category: '', amount_excl: '', vat_pct: '21', cost_date: today, start_date: today, end_date: '', billing_frequency: 'monthly', notes: '' })
    setType('one_time'); setError(null)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) { setError('Geef een naam op'); return }
    if (!form.amount_excl || excl <= 0) { setError('Geef een bedrag op'); return }
    setLoading(true); setError(null)
    try {
      const res = await fetch('/api/admin/costs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, category: form.category || null, type,
          amount_excl: excl, vat_pct: vat,
          cost_date: type === 'one_time' ? form.cost_date : undefined,
          start_date: type === 'recurring' ? form.start_date : undefined,
          end_date: type === 'recurring' ? (form.end_date || null) : undefined,
          billing_frequency: type === 'recurring' ? form.billing_frequency : undefined,
          notes: form.notes,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setOpen(false); reset(); router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally { setLoading(false) }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn-secondary">
        <Plus className="h-4 w-4" />
        Kost toevoegen
      </button>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl">
          <h3 className="font-semibold text-gray-900">Kost toevoegen</h3>
          <button onClick={() => { setOpen(false); reset() }} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 rounded-xl">
            {(['one_time', 'recurring'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors ${type === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {t === 'recurring' ? <Repeat2 className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                {t === 'recurring' ? 'Recurring' : 'Eenmalig'}
              </button>
            ))}
          </div>

          <div>
            <label className={lbl}>Naam *</label>
            <input required className={inp} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="bv. Adobe Creative Cloud, freelance editor…" />
          </div>

          <div>
            <label className={lbl}>Categorie</label>
            <input className={inp} list="cost-categories" value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Kies of typ een categorie" />
            <datalist id="cost-categories">{CATEGORIES.map(c => <option key={c} value={c} />)}</datalist>
          </div>

          {type === 'one_time' ? (
            <div>
              <label className={lbl}>Datum *</label>
              <input required type="date" className={inp} value={form.cost_date} onChange={e => setForm(p => ({ ...p, cost_date: e.target.value }))} />
            </div>
          ) : (
            <>
              <div>
                <label className={lbl}>Frequentie</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {FREQ_OPTIONS.map(f => (
                    <button key={f.value} type="button" onClick={() => setForm(p => ({ ...p, billing_frequency: f.value }))}
                      className={`py-2 rounded-lg border text-xs font-medium transition-colors ${form.billing_frequency === f.value ? 'border-[#fff848] bg-[#fff848]/10 text-black' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={lbl}>Startdatum *</label>
                  <input required type="date" className={inp} value={form.start_date} onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))} />
                </div>
                <div>
                  <label className={lbl}>Einddatum (optioneel)</label>
                  <input type="date" className={inp} value={form.end_date} onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))} />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Bedrag excl. btw (€) *</label>
              <input required type="number" min="0" step="0.01" className={inp} value={form.amount_excl} onChange={e => setForm(p => ({ ...p, amount_excl: e.target.value }))} placeholder="100" />
            </div>
            <div>
              <label className={lbl}>BTW %</label>
              <input type="number" min="0" step="1" className={inp} value={form.vat_pct} onChange={e => setForm(p => ({ ...p, vat_pct: e.target.value }))} />
            </div>
          </div>

          {excl > 0 && (
            <div className="text-xs text-gray-500 bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
              Incl. btw: <span className="font-semibold text-gray-700">{fmt(incl)}</span>
              {type === 'recurring' && <span className="text-gray-400"> · per {FREQ_OPTIONS.find(f => f.value === form.billing_frequency)?.label.toLowerCase()}</span>}
            </div>
          )}

          <div>
            <label className={lbl}>Notitie</label>
            <input className={inp} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optioneel" />
          </div>

          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Toevoegen
            </button>
            <button type="button" onClick={() => { setOpen(false); reset() }} className="btn-secondary">Annuleer</button>
          </div>
        </form>
      </div>
    </div>
  )
}
