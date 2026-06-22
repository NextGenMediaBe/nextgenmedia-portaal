'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, CheckCircle2, Trash2, RefreshCw, Save, Eye, Pencil, AlertTriangle, Newspaper } from 'lucide-react'
import { toast } from 'sonner'
import { formatDate } from '@/lib/utils'

export type ReviewBlog = {
  id: string; client_id: string; client_name?: string; titel: string; slug: string
  content: string | null; meta_title: string | null; meta_description: string | null; thumbnail_url: string | null
  status: string; foutmelding: string | null; gegenereerd_op: string
}

const STATUS_LABEL: Record<string, string> = { klaar_voor_review: 'Klaar voor review', goedgekeurd: 'Goedgekeurd', gepubliceerd: 'Gepubliceerd', gefaald: 'Gefaald' }
const STATUS_CLS: Record<string, string> = { klaar_voor_review: 'bg-amber-100 text-amber-700', goedgekeurd: 'bg-blue-100 text-blue-700', gepubliceerd: 'bg-green-100 text-green-700', gefaald: 'bg-red-100 text-red-700' }
const STATUSES = ['klaar_voor_review', 'goedgekeurd', 'gepubliceerd', 'gefaald']

export function BlogReview({ initialBlogs, clients, initialClient }: { initialBlogs: ReviewBlog[]; clients: { id: string; company_name: string }[]; initialClient: string }) {
  const router = useRouter()
  const [blogs, setBlogs] = useState(initialBlogs)
  const [fClient, setFClient] = useState(initialClient)
  const [fStatus, setFStatus] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const filtered = blogs.filter((b) => (!fClient || b.client_id === fClient) && (!fStatus || b.status === fStatus))

  const refresh = () => router.refresh()

  const act = async (id: string, body: object, okMsg?: string) => {
    setBusy(id)
    try {
      const res = await fetch('/api/admin/blogs', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      if (body && (body as { action?: string }).action === 'approve') {
        // Openstaande Framer-wijzigingen → admin bevestigt en publiceert alsnog.
        if (j.needsConfirm) {
          setBusy(null)
          if (confirm(`${j.warning ?? 'Er staan nog niet-gepubliceerde wijzigingen in dit Framer-project.'}\n\nToch publiceren?`)) {
            await act(id, { action: 'approve', confirm_override: true })
          }
          return
        }
        if (j.published) {
          toast.success('Gepubliceerd op Framer.')
          if (j.firstPublish) toast.message('Eerste publicatie voor deze klant — controleer het resultaat op de website.')
        } else if (j.pending) {
          toast.message('Goedgekeurd — Publicatie gestart.')
        } else {
          toast.error(`Publicatie mislukt: ${j.error ?? 'onbekend'}`)
        }
      } else if (okMsg) toast.success(okMsg)
      refresh()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Fout') } finally { setBusy(null) }
  }

  const remove = async (id: string) => {
    if (!confirm('Deze blog afkeuren/verwijderen?')) return
    setBusy(id)
    try { await fetch(`/api/admin/blogs?id=${id}`, { method: 'DELETE' }); setBlogs((x) => x.filter((b) => b.id !== id)) } finally { setBusy(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select value={fClient} onChange={(e) => setFClient(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle klanten</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}</select>
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"><option value="">Alle statussen</option>{STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
        <span className="text-xs text-gray-400">{filtered.length} blog(s)</span>
      </div>

      {filtered.length === 0 ? (
        <div className="card-base empty-state"><Newspaper className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="text-sm">Geen blogs voor deze selectie.</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <BlogCard key={b.id} blog={b} editing={editing === b.id} busy={busy === b.id}
              onEdit={() => setEditing(editing === b.id ? null : b.id)}
              onSave={(patch) => { act(b.id, { ...patch }, 'Opgeslagen.'); setEditing(null) }}
              onApprove={() => act(b.id, { action: 'approve' })}
              onRegenerate={() => act(b.id, { action: 'regenerate' }, 'Opnieuw gegenereerd.')}
              onDelete={() => remove(b.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function BlogCard({ blog, editing, busy, onEdit, onSave, onApprove, onRegenerate, onDelete }: {
  blog: ReviewBlog; editing: boolean; busy: boolean
  onEdit: () => void; onSave: (p: Partial<ReviewBlog>) => void; onApprove: () => void; onRegenerate: () => void; onDelete: () => void
}) {
  const [f, setF] = useState({ titel: blog.titel, slug: blog.slug, content: blog.content ?? '', meta_title: blog.meta_title ?? '', meta_description: blog.meta_description ?? '', thumbnail_url: blog.thumbnail_url ?? '' })
  const [preview, setPreview] = useState(false)
  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  const canApprove = blog.status === 'klaar_voor_review' || blog.status === 'goedgekeurd' || blog.status === 'gefaald'

  return (
    <div className="card-base">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium flex items-center gap-2 flex-wrap">{blog.titel}<span className={`status-badge text-[10px] ${STATUS_CLS[blog.status] ?? 'bg-gray-100 text-gray-500'}`}>{STATUS_LABEL[blog.status] ?? blog.status}</span></div>
          <div className="text-xs text-gray-400 mt-0.5">{blog.client_name} · {formatDate(blog.gegenereerd_op)} · /{blog.slug}</div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setPreview((p) => !p)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" title="Preview"><Eye className="h-3.5 w-3.5" /></button>
          <button onClick={onEdit} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400" title="Bewerken"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} disabled={busy} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-red-400" title="Afkeuren/verwijderen">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}</button>
        </div>
      </div>

      {blog.foutmelding && (
        <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /><span>{blog.foutmelding}</span>
        </div>
      )}

      {preview && !editing && (
        <div className="mt-3 rounded-lg border border-gray-100 bg-gray-50/60 p-3 max-h-80 overflow-y-auto">
          <div className="text-[11px] text-gray-400 mb-1">{blog.meta_title} — {blog.meta_description}</div>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">{blog.content}</pre>
        </div>
      )}

      {editing && (
        <div className="mt-3 space-y-2">
          <input className={inp} value={f.titel} onChange={(e) => setF((x) => ({ ...x, titel: e.target.value }))} placeholder="Titel" />
          <input className={inp} value={f.slug} onChange={(e) => setF((x) => ({ ...x, slug: e.target.value }))} placeholder="slug" />
          <textarea rows={10} className={`${inp} font-mono text-xs`} value={f.content} onChange={(e) => setF((x) => ({ ...x, content: e.target.value }))} placeholder="Content (Markdown/HTML)" />
          <div className="grid grid-cols-2 gap-2">
            <input className={inp} value={f.meta_title} onChange={(e) => setF((x) => ({ ...x, meta_title: e.target.value }))} placeholder="Meta title" />
            <input className={inp} value={f.thumbnail_url} onChange={(e) => setF((x) => ({ ...x, thumbnail_url: e.target.value }))} placeholder="Thumbnail URL" />
          </div>
          <input className={inp} value={f.meta_description} onChange={(e) => setF((x) => ({ ...x, meta_description: e.target.value }))} placeholder="Meta description" />
          <button onClick={() => onSave(f)} disabled={busy} className="btn-secondary text-xs"><Save className="h-3.5 w-3.5" />Opslaan</button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {canApprove && blog.status !== 'gepubliceerd' && (
          <button onClick={onApprove} disabled={busy} className="btn-primary text-xs">{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}{blog.status === 'gefaald' ? 'Opnieuw publiceren' : 'Goedkeuren & publiceren'}</button>
        )}
        <button onClick={onRegenerate} disabled={busy} className="btn-secondary text-xs"><RefreshCw className="h-3.5 w-3.5" />Opnieuw genereren</button>
      </div>
    </div>
  )
}
