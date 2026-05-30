'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Edit2, Save, X } from 'lucide-react'

const ALL_SERVICES = [
  { slug: 'social-media', label: 'Social Media Management' },
  { slug: 'webdesign', label: 'Website' },
  { slug: 'foto-video', label: 'Foto & Videografie' },
  { slug: 'grafisch-ontwerp', label: 'Grafisch Ontwerp' },
  { slug: 'marketing-consultancy', label: 'Marketing Consultancy' },
  { slug: 'ads', label: 'Google Advertising' },
]

const PLATFORMS = [
  { slug: 'meta', label: 'Meta' },
  { slug: 'linkedin', label: 'LinkedIn' },
  { slug: 'tiktok', label: 'TikTok' },
  { slug: 'pinterest', label: 'Pinterest' },
  { slug: 'twitter', label: 'Twitter/X' },
]

type Client = {
  id: string
  company_name: string
  contact_name: string | null
  niche: string | null
  website_url: string | null
}

export function ClientEditForm({
  client,
  services: initialServices,
  socialConfig,
  adsConfig,
  webdesignConfig,
}: {
  client: Client
  services: string[]
  socialConfig: { posts?: number; reels?: number; stories?: number; channels?: string[] }
  adsConfig: { budget?: number }
  webdesignConfig: { maintenance_included?: boolean }
}) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    company_name: client.company_name,
    contact_name: client.contact_name ?? '',
    niche: client.niche ?? '',
    website_url: client.website_url ?? '',
  })

  const [services, setServices] = useState<string[]>(initialServices)
  const [posts, setPosts] = useState(String(socialConfig.posts ?? 0))
  const [reels, setReels] = useState(String(socialConfig.reels ?? 0))
  const [stories, setStories] = useState(String(socialConfig.stories ?? 0))
  const [platforms, setPlatforms] = useState<string[]>(socialConfig.channels ?? [])
  const [maintenanceIncluded, setMaintenanceIncluded] = useState(webdesignConfig.maintenance_included ?? false)
  const [adsBudget, setAdsBudget] = useState(String(adsConfig.budget ?? ''))

  const hasSocial = services.includes('social-media')
  const hasWebdesign = services.includes('webdesign')
  const hasAds = services.includes('ads')

  const toggleService = (slug: string) =>
    setServices(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

  const togglePlatform = (slug: string) =>
    setPlatforms(prev => prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug])

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/clients/${client.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          services,
          posts_per_month: parseInt(posts) || 0,
          reels_per_month: parseInt(reels) || 0,
          stories_per_month: parseInt(stories) || 0,
          platforms,
          webdesign_maintenance_included: maintenanceIncluded,
          ads_budget: adsBudget ? parseFloat(adsBudget) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Mislukt')
      setEditing(false)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout')
    } finally {
      setLoading(false)
    }
  }

  const inp = 'input-base'
  const lbl = 'block text-xs font-medium text-gray-500 mb-1'

  if (!editing) {
    return (
      <button onClick={() => setEditing(true)} className="btn-secondary w-full">
        <Edit2 className="h-4 w-4" />
        Klant & diensten bewerken
      </button>
    )
  }

  return (
    <div className="card-base space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Bewerken</h2>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Basic info */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Bedrijfsgegevens</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={lbl}>Bedrijfsnaam</label>
            <input className={inp} value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Contactpersoon</label>
            <input className={inp} value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Niche</label>
            <input className={inp} value={form.niche} onChange={e => setForm(p => ({ ...p, niche: e.target.value }))} />
          </div>
          <div>
            <label className={lbl}>Website</label>
            <input type="url" className={inp} value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} />
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Actieve diensten</h3>
        <div className="grid grid-cols-2 gap-2">
          {ALL_SERVICES.map(s => (
            <button
              key={s.slug}
              type="button"
              onClick={() => toggleService(s.slug)}
              className={`px-3 py-2 rounded-lg border text-sm font-medium text-left transition-colors ${
                services.includes(s.slug)
                  ? 'border-[#fff848] bg-[#fff848]/10 text-black'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Social media settings */}
      {hasSocial && (
        <div className="space-y-3 border-t border-gray-100 pt-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Social Media instellingen</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <label className={lbl}>Posts/maand</label>
              <input type="number" min="0" max="60" className={inp} value={posts} onChange={e => setPosts(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Reels/maand</label>
              <input type="number" min="0" max="60" className={inp} value={reels} onChange={e => setReels(e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Stories/maand</label>
              <input type="number" min="0" max="60" className={inp} value={stories} onChange={e => setStories(e.target.value)} />
            </div>
          </div>
          <div>
            <label className={lbl}>Kanalen</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {PLATFORMS.map(p => (
                <button
                  key={p.slug}
                  type="button"
                  onClick={() => togglePlatform(p.slug)}
                  className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors ${
                    platforms.includes(p.slug)
                      ? 'border-[#fff848] bg-[#fff848]/10 text-black'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Webdesign settings */}
      {hasWebdesign && (
        <div className="border-t border-gray-100 pt-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Website instellingen</h3>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={maintenanceIncluded}
              onChange={e => setMaintenanceIncluded(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-[#fff848]"
            />
            <span className="text-sm text-gray-700">Onderhoud inbegrepen</span>
          </label>
        </div>
      )}

      {/* Ads settings */}
      {hasAds && (
        <div className="border-t border-gray-100 pt-3">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Advertising</h3>
          <div>
            <label className={lbl}>Maandelijks budget (€)</label>
            <input type="number" min="0" className={inp} value={adsBudget} onChange={e => setAdsBudget(e.target.value)} placeholder="500" />
          </div>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>
      )}

      <div className="flex gap-2">
        <button onClick={handleSave} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Opslaan
        </button>
        <button onClick={() => setEditing(false)} className="btn-secondary">Annuleren</button>
      </div>
    </div>
  )
}
