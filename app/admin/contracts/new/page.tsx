'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ChevronLeft, Loader2, Upload } from 'lucide-react'

export default function NewContractPage() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; company_name: string }>>([])
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState({
    client_id: '',
    title: '',
    service_slug: '',
    signer_name: '',
    signer_email: '',
  })

  useEffect(() => {
    // cache: 'no-store' guarantees the freshest clients list (newly created/deleted clients show immediately)
    fetch('/api/admin/clients-list', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => setClients(j.clients ?? []))
      .catch(() => setClients([]))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Selecteer een PDF-bestand'); return }
    setLoading(true)
    setError(null)

    try {
      const fd = new FormData()
      fd.append('pdf', file)
      fd.append('client_id', form.client_id)
      fd.append('title', form.title)
      fd.append('service_slug', form.service_slug)
      fd.append('signer_name', form.signer_name)
      fd.append('signer_email', form.signer_email)

      const res = await fetch('/api/admin/contracts', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // Hard redirect — guarantees the contracts list shows the new contract
      window.location.href = `/admin/contracts/${json.id}`
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'input-base'
  const lbl = 'block text-sm font-medium text-gray-700 mb-1'

  return (
    <div className="max-w-xl space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <Link href="/admin/contracts" className="btn-secondary px-2">
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Nieuw contract</h1>
          <p className="text-sm text-gray-500">Upload een PDF-contract en koppel aan klant</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card-base space-y-4">
        <div>
          <label className={lbl}>Klant *</label>
          <select required className={inp} value={form.client_id} onChange={(e) => setForm((p) => ({ ...p, client_id: e.target.value }))}>
            <option value="">— Selecteer klant —</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Contracttitel *</label>
          <input required className={inp} value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} placeholder="Social Media Contract 2025" />
        </div>
        <div>
          <label className={lbl}>Dienst (voor portaaltoegang)</label>
          <select className={inp} value={form.service_slug} onChange={(e) => setForm((p) => ({ ...p, service_slug: e.target.value }))}>
            <option value="">— Geen koppeling —</option>
            <option value="social-media">Social Media Management</option>
            <option value="webdesign">Website</option>
            <option value="foto-video">Foto &amp; Videografie</option>
            <option value="grafisch-ontwerp">Grafisch Ontwerp</option>
            <option value="marketing-consultancy">Marketing Consultancy</option>
            <option value="ads">Google Advertising</option>
          </select>
          <p className="text-xs text-gray-400 mt-1">Als dit contract getekend wordt, kan de admin portaaltoegang verlenen voor deze dienst.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Naam ondertekenaar</label>
            <input className={inp} value={form.signer_name} onChange={(e) => setForm((p) => ({ ...p, signer_name: e.target.value }))} placeholder="Jan Janssen" />
          </div>
          <div>
            <label className={lbl}>E-mail ondertekenaar</label>
            <input type="email" className={inp} value={form.signer_email} onChange={(e) => setForm((p) => ({ ...p, signer_email: e.target.value }))} placeholder="jan@bedrijf.be" />
          </div>
        </div>
        <div>
          <label className={lbl}>PDF-contract *</label>
          <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-[#fff848] transition-colors">
            <Upload className="h-6 w-6 text-gray-400" />
            <span className="text-sm text-gray-500">
              {file ? file.name : 'Klik om PDF te selecteren'}
            </span>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Contract aanmaken
          </button>
          <Link href="/admin/contracts" className="btn-secondary">Annuleren</Link>
        </div>
      </form>
    </div>
  )
}
