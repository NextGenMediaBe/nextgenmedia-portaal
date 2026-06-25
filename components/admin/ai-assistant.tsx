'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Sparkles, X, Send, Loader2, ArrowRight } from 'lucide-react'

type Msg = { role: 'user' | 'assistant'; content: string; actions?: { label: string; href: string }[] }

const SUGGESTIONS = [
  'Welke facturen moeten vandaag verstuurd worden?',
  'Welke klanten hebben nog geen contract?',
  'Welke klanten hebben geen prognose?',
  'Welke klanten hebben geen Framer-project?',
]

// ✨ NextGen AI — globale assistent (read-only). Doet voorstellen met deep-links;
// voert nooit zelf acties uit (mens bevestigt door te klikken).
export function AiAssistant() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, loading])

  const send = async (text: string) => {
    const q = text.trim()
    if (!q || loading) return
    const next = [...msgs, { role: 'user' as const, content: q }]
    setMsgs(next); setInput(''); setLoading(true)
    try {
      const res = await fetch('/api/admin/ai-assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setMsgs((m) => [...m, { role: 'assistant', content: j.answer, actions: j.actions }])
    } catch (e) {
      setMsgs((m) => [...m, { role: 'assistant', content: e instanceof Error ? e.message : 'Er ging iets mis.' }])
    } finally { setLoading(false) }
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-full bg-gray-900 text-white pl-3.5 pr-4 py-2.5 shadow-md hover:bg-black transition-colors"
        >
          <Sparkles className="h-4 w-4" />
          <span className="text-sm font-medium">NextGen AI</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-5 right-5 z-50 w-[min(420px,calc(100vw-2.5rem))] h-[min(600px,calc(100vh-2.5rem))] bg-white border border-gray-200 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-900 text-white">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[#fff848]" /><span className="font-semibold text-sm">NextGen AI</span></div>
            <button onClick={() => setOpen(false)} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3">
            {msgs.length === 0 && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">Vraag iets over je platform. Ik lees mee en doe voorstellen — uitvoeren doe jij met één klik.</p>
                <div className="space-y-1.5">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => send(s)} className="w-full text-left text-sm px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">{s}</button>
                  ))}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-[#fff848]/30 text-gray-900' : 'bg-gray-100 text-gray-800'}`}>
                  {m.content}
                  {m.actions && m.actions.length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      <div className="text-[11px] font-semibold text-amber-700">Voorstel — bevestiging vereist</div>
                      {m.actions.map((a, j) => (
                        <Link key={j} href={a.href} onClick={() => setOpen(false)} className="flex items-center justify-between gap-2 text-xs font-medium bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 hover:border-gray-300">
                          {a.label}<ArrowRight className="h-3.5 w-3.5 text-gray-400" />
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {loading && <div className="flex justify-start"><div className="bg-gray-100 rounded-2xl px-3 py-2"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div></div>}
          </div>

          <form onSubmit={(e) => { e.preventDefault(); send(input) }} className="p-3 border-t border-gray-100 flex items-center gap-2">
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Stel een vraag…" className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#fff848]/50" />
            <button type="submit" disabled={loading || !input.trim()} className="btn-primary px-3 disabled:opacity-40"><Send className="h-4 w-4" /></button>
          </form>
        </div>
      )}
    </>
  )
}
