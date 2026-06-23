'use client'

import { useEffect, useState } from 'react'
import { Mail, X, Loader2, Send, CheckCircle2 } from 'lucide-react'
import { renderTemplate, type MailVars } from '@/lib/email-render'

type Template = { id: string; name: string; subject: string; body: string; kind: string | null; cta_text: string | null; cta_link: string | null }

// Handmatige contractmail — werkt voor gekoppelde én losse contracten.
// Zet bij verzenden de status op 'verzonden', logt audit + E-mail Center.
export function ContractMailButton({
  contractId, contractTitle, signLink, defaultEmail, signerName, clientName, expiresAt,
  label = 'Verstuur contractmail', className = 'btn-secondary text-sm',
}: {
  contractId: string
  contractTitle: string
  signLink: string
  defaultEmail?: string | null
  signerName?: string | null
  clientName?: string | null
  expiresAt?: string | null
  label?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}><Mail className="h-4 w-4" />{label}</button>
      {open && (
        <Dialog
          contractId={contractId} contractTitle={contractTitle} signLink={signLink}
          defaultEmail={defaultEmail} signerName={signerName} clientName={clientName} expiresAt={expiresAt}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function Dialog({
  contractId, contractTitle, signLink, defaultEmail, signerName, clientName, expiresAt, onClose,
}: {
  contractId: string; contractTitle: string; signLink: string
  defaultEmail?: string | null; signerName?: string | null; clientName?: string | null; expiresAt?: string | null
  onClose: () => void
}) {
  const [toEmail, setToEmail] = useState(defaultEmail ?? '')
  const [templates, setTemplates] = useState<Template[]>([])
  const [templateId, setTemplateId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [ctaText, setCtaText] = useState('Contract ondertekenen')
  const [ctaLink, setCtaLink] = useState(signLink)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const vervaldatum = expiresAt
    ? new Date(expiresAt + 'T00:00:00').toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  const vars: MailVars = {
    klantnaam: signerName || clientName || 'klant',
    bedrijfsnaam: clientName || '',
    contractnaam: contractTitle,
    contract_link: signLink,
    datum: vervaldatum,
  }

  // Standaardtekst als er geen template gekozen wordt.
  const defaultBody =
    `Beste ${signerName || clientName || 'klant'},\n\n` +
    `Hierbij ontvang je het contract "${contractTitle}" ter ondertekening.\n\n` +
    `Klik op de knop hieronder om het contract te bekijken en digitaal te ondertekenen.` +
    (vervaldatum ? `\n\nLet op: deze tekenlink is geldig tot ${vervaldatum}.` : '') +
    `\n\nMet vriendelijke groet,\nNextGenMedia`

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/email/templates')
        const j = await res.json()
        const list = (j.templates ?? []) as Template[]
        setTemplates(list)
        const suggested = list.find((t) => t.kind === 'contract')
        if (suggested) applyTemplate(suggested)
        else { setSubject(`Contract ter ondertekening — ${contractTitle}`); setBody(defaultBody) }
      } catch {
        setSubject(`Contract ter ondertekening — ${contractTitle}`); setBody(defaultBody)
      } finally { setLoading(false) }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyTemplate = (t: Template) => {
    setTemplateId(t.id)
    setSubject(renderTemplate(t.subject, vars) || `Contract ter ondertekening — ${contractTitle}`)
    setBody(renderTemplate(t.body, vars) || defaultBody)
    setCtaText(renderTemplate(t.cta_text ?? '', vars) || 'Contract ondertekenen')
    setCtaLink(renderTemplate(t.cta_link ?? '', vars) || signLink)
  }

  const onPick = (id: string) => {
    const t = templates.find((x) => x.id === id)
    if (t) applyTemplate(t)
    else { setTemplateId(''); setSubject(`Contract ter ondertekening — ${contractTitle}`); setBody(defaultBody); setCtaText('Contract ondertekenen'); setCtaLink(signLink) }
  }

  const send = async () => {
    if (!toEmail.trim()) { setError('Vul een e-mailadres in'); return }
    if (!subject.trim()) { setError('Onderwerp is verplicht'); return }
    setSending(true); setError(null)
    try {
      const tpl = templates.find((t) => t.id === templateId)
      const res = await fetch(`/api/admin/contracts/${contractId}/send-mail`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_email: toEmail, subject, body, cta_text: ctaText || null, cta_link: ctaLink || null, template_id: templateId || null, template_name: tpl?.name ?? null }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      setDone(true)
      setTimeout(() => window.location.reload(), 1200)
    } catch (e) { setError(e instanceof Error ? e.message : 'Fout') } finally { setSending(false) }
  }

  const inp = 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4" />Verstuur contractmail</h3>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
            <p className="text-sm font-medium">Contractmail verstuurd naar {toEmail}</p>
          </div>
        ) : loading ? (
          <div className="p-8 text-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : (
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Aan (e-mail)</label>
              <input className={inp} value={toEmail} onChange={(e) => setToEmail(e.target.value)} placeholder="ontvanger@bedrijf.be" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Template</label>
              <select className={inp} value={templateId} onChange={(e) => onPick(e.target.value)}>
                <option value="">— Standaard contractmail —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Onderwerp</label>
              <input className={inp} value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Inhoud</label>
              <textarea rows={8} className={inp} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Knop-tekst</label>
                <input className={inp} value={ctaText} onChange={(e) => setCtaText(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Knop-link (tekenlink)</label>
                <input className={inp} value={ctaLink} onChange={(e) => setCtaLink(e.target.value)} />
              </div>
            </div>
            {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
            <div className="flex gap-2 pt-1">
              <button onClick={send} disabled={sending} className="btn-primary flex-1 justify-center">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}Verstuur</button>
              <button onClick={onClose} className="btn-secondary">Annuleer</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
