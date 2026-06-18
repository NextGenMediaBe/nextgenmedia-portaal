'use client'

import { useEffect, useState } from 'react'
import { Mail, X, Loader2, Send, CheckCircle2 } from 'lucide-react'
import { renderTemplate, type MailVars } from '@/lib/email-render'

type Template = { id: string; name: string; subject: string; body: string; kind: string | null; cta_text: string | null; cta_link: string | null }

export function SendMailButton({
  clientId, kind, contractId, shootId, label = 'Verstuur mail', className = 'btn-secondary text-sm',
}: {
  clientId: string
  kind?: string
  contractId?: string
  shootId?: string
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}><Mail className="h-4 w-4" />{label}</button>
      {open && <Dialog clientId={clientId} kind={kind} contractId={contractId} shootId={shootId} onClose={() => setOpen(false)} />}
    </>
  )
}

function Dialog({
  clientId, kind, contractId, shootId, onClose,
}: {
  clientId: string; kind?: string; contractId?: string; shootId?: string; onClose: () => void
}) {
  const [loadingCtx, setLoadingCtx] = useState(true)
  const [toEmail, setToEmail] = useState('')
  const [vars, setVars] = useState<MailVars>({})
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('')
  const [ctaLink, setCtaLink] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams({ client_id: clientId })
        if (kind) qs.set('kind', kind)
        if (contractId) qs.set('contract_id', contractId)
        if (shootId) qs.set('shoot_id', shootId)
        const [ctxRes, tplRes] = await Promise.all([
          fetch(`/api/admin/email/context?${qs.toString()}`),
          fetch('/api/admin/email/templates'),
        ])
        const ctx = await ctxRes.json()
        const tpl = await tplRes.json()
        if (ctxRes.ok) { setToEmail(ctx.toEmail ?? ''); setVars(ctx.vars ?? {}) }
        const list = (tpl.templates ?? []) as Template[]
        setTemplates(list)
        // Suggereer een template dat bij dit type past.
        const suggested = list.find((t) => t.kind === kind) ?? list[0]
        if (suggested) applyTemplate(suggested, ctx.vars ?? {})
      } catch { setError('Laden mislukt') } finally { setLoadingCtx(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyTemplate = (t: Template, v: MailVars) => {
    setTemplateId(t.id)
    setSubject(renderTemplate(t.subject, v))
    setBody(renderTemplate(t.body, v))
    setCtaText(renderTemplate(t.cta_text ?? '', v))
    setCtaLink(renderTemplate(t.cta_link ?? '', v))
  }

  const onPick = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (t) applyTemplate(t, vars)
    else { setTemplateId(''); setCtaText(''); setCtaLink('') }
  }

  const send = async () => {
    if (!toEmail) { setError('Deze klant heeft geen e-mailadres'); return }
    if (!subject.trim()) { setError('Onderwerp is verplicht'); return }
    setSending(true); setError(null)
    try {
      const tpl = templates.find((t) => t.id === templateId)
      const res = await fetch('/api/admin/email/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: toEmail, to_client_id: clientId, subject, body, cta_text: ctaText || null, cta_link: ctaLink || null, template_id: templateId || null, template_name: tpl?.name ?? null, kind: kind ?? 'generic' }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      setDone(true)
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setSending(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Mail versturen naar klant</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-sm font-medium">Mail verstuurd naar {toEmail}</p>
            <button onClick={onClose} className="btn-primary">Sluiten</button>
          </div>
        ) : loadingCtx ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : (
          <div className="p-5 space-y-3">
            <div className="text-xs text-gray-500">Aan: <span className="font-medium text-gray-800">{toEmail || '— geen e-mailadres —'}</span></div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
              <select className={inp} value={templateId} onChange={(e) => onPick(e.target.value)}>
                <option value="">— Eigen mail —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {templates.length === 0 && <p className="text-[11px] text-amber-600 mt-1">Nog geen templates. Maak ze aan in E-mail Center → Templates.</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Onderwerp</label>
              <input className={inp} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Inhoud</label>
              <textarea rows={9} className={inp} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Knop-tekst (CTA)</label>
                <input className={inp} value={ctaText} onChange={(e) => setCtaText(e.target.value)} placeholder="Bv. Contract bekijken" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Knop-link</label>
                <input className={inp} value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            {ctaText && ctaLink && (
              <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center">
                <span className="text-[11px] text-gray-400 block mb-1">Voorbeeld knop in de mail</span>
                <span className="inline-block rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white" style={{ borderBottom: '3px solid #fff848' }}>{ctaText}</span>
              </div>
            )}
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex gap-2 pt-1">
              <button onClick={send} disabled={sending || !toEmail} className="btn-primary flex-1 justify-center">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Verstuur mail</button>
              <button onClick={onClose} className="btn-secondary">Annuleer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
