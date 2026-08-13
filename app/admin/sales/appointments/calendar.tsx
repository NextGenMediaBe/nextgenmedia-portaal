'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, ChevronLeft, ChevronRight, Link2, CalendarClock, X, Trash2, Video, Settings2, Move } from 'lucide-react'
import { complement, snapToSlot, isBookable, type Interval } from '@/lib/sales/availability'
import { AvailabilityPanel } from './availability-panel'

type SalesClient = {
  id: string; name: string; timezone: string
  slot_interval_min: number; default_duration_min: number
}
type Appt = {
  id: string; starts_at: string; ends_at: string; status: string
  lead_id: string | null; company: string | null; contact: string | null
}
type LeadOption = { id: string; label: string; email: string | null }

// Zichtbaar dagvenster. Buiten deze uren is toch alles grijs; dit houdt de
// kalender compact zonder dat je 24 uur moet scrollen.
const DAY_START_H = 7
const DAY_END_H = 21
const PX_PER_MIN = 0.9

const startOfWeek = (d: Date): Date => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const dow = (x.getDay() + 6) % 7      // 0 = maandag
  x.setDate(x.getDate() - dow)
  return x
}
const hhmm = (ms: number) =>
  new Date(ms).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' })

export function SalesCalendar({ clients, initialClientId, initialLeadId }: {
  clients: SalesClient[]
  initialClientId: string
  initialLeadId?: string
}) {
  const [clientId, setClientId] = useState(initialClientId)
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [loading, setLoading] = useState(true)
  const [segments, setSegments] = useState<Interval[]>([])
  const [appointments, setAppointments] = useState<Appt[]>([])
  const [connected, setConnected] = useState(false)
  const [leads, setLeads] = useState<LeadOption[]>([])
  // Agenda's (personen) van deze klant — Bram, Marco, …
  const [owners, setOwners] = useState<{ id: string; name: string; account_email: string | null; status: string }[]>([])
  const [ownerId, setOwnerId] = useState<string>('')

  // Sleep-selectie
  const [drag, setDrag] = useState<{ segIdx: number; start: number; end: number } | null>(null)
  const dragRef = useRef<{ seg: Interval; anchor: number } | null>(null)
  const [booking, setBooking] = useState<{ start: number; end: number } | null>(null)
  const [showAvailability, setShowAvailability] = useState(false)

  // Bestaande afspraak verslepen naar een ander wit moment (§5).
  const [moving, setMoving] = useState<{ id: string; start: number; end: number; valid: boolean } | null>(null)
  const moveRef = useRef<{ id: string; duration: number; grabOffset: number } | null>(null)

  const client = clients.find((c) => c.id === clientId) ?? clients[0]
  const from = weekStart.getTime()
  const to = from + 7 * 86400000

  const load = useCallback(async () => {
    if (!clientId) return
    setLoading(true)
    try {
      const p = new URLSearchParams({ client: clientId, from: String(from), to: String(to) })
      if (ownerId) p.set('owner', ownerId)
      const res = await fetch(`/api/admin/sales/calendar?${p}`)
      const j = await res.json()
      if (!res.ok) throw new Error(j.error)
      setSegments(j.segments ?? [])
      setAppointments(j.appointments ?? [])
      setConnected(!!j.connected)
      setOwners(j.owners ?? [])
      // De server bepaalt welke agenda getoond wordt als er nog geen keuze is.
      if (j.ownerId && j.ownerId !== ownerId) setOwnerId(j.ownerId)
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Agenda laden mislukt') } finally { setLoading(false) }
  }, [clientId, from, to, ownerId])
  useEffect(() => { load() }, [load])

  // Leads voor de koppeling in het boekingspaneel.
  useEffect(() => {
    if (!clientId) return
    fetch(`/api/admin/sales/leads?client=${clientId}`)
      .then((r) => r.json())
      .then((j) => setLeads((j.leads ?? []).map((l: {
        id: string
        sales_companies?: { name?: string } | null
        sales_contacts?: { name?: string; email?: string } | null
      }) => ({
        id: l.id,
        label: [l.sales_companies?.name, l.sales_contacts?.name].filter(Boolean).join(' · ') || 'Lead',
        email: l.sales_contacts?.email ?? null,
      }))))
      .catch(() => setLeads([]))
  }, [clientId])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(from + i * 86400000)), [from])

  // Grijs = het COMPLEMENT van wit. Dezelfde bron, dus beeld en gedrag kunnen
  // niet uiteenlopen: waar geen wit segment ligt, kun je ook niet slepen.
  const greyByDay = useMemo(() => days.map((d) => {
    const s = d.getTime(), e = s + 86400000
    return complement(segments.filter((x) => x.end > s && x.start < e), s, e)
  }), [days, segments])

  const dayTop = (d: Date) => new Date(d).setHours(DAY_START_H, 0, 0, 0)
  const yOf = (ms: number, d: Date) => ((ms - dayTop(d)) / 60000) * PX_PER_MIN
  const gridHeight = (DAY_END_H - DAY_START_H) * 60 * PX_PER_MIN

  // ── Slepen: begint ALTIJD op een wit segment ───────────────────────────────
  const onSegmentDown = (e: React.MouseEvent, seg: Interval, day: Date, idx: number) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const slot = client?.slot_interval_min ?? 30
    const msAt = (clientY: number) => {
      const min = (clientY - rect.top) / PX_PER_MIN
      return seg.start + min * 60000
    }
    const anchor = Math.min(Math.max(snapToSlot(msAt(e.clientY), slot), seg.start), seg.end)
    dragRef.current = { seg, anchor }
    const dur = (client?.default_duration_min ?? 30) * 60000
    setDrag({ segIdx: idx, start: anchor, end: Math.min(anchor + dur, seg.end) })
  }

  useEffect(() => {
    if (!drag) return
    const slot = client?.slot_interval_min ?? 30
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current
      if (!d) return
      const el = document.querySelector<HTMLElement>(`[data-seg="${drag.segIdx}"]`)
      if (!el) return
      const rect = el.getBoundingClientRect()
      const min = (ev.clientY - rect.top) / PX_PER_MIN
      let cursor = snapToSlot(d.seg.start + min * 60000, slot, 'ceil')
      // Klemmen binnen het witte segment: buiten wit bestaat er geen boeking.
      cursor = Math.min(Math.max(cursor, d.seg.start), d.seg.end)
      const start = Math.min(d.anchor, cursor)
      const end = Math.max(d.anchor, cursor)
      setDrag((cur) => cur && ({ ...cur, start, end: Math.max(end, start + slot * 60000) }))
    }
    const onUp = () => {
      const cur = dragRef.current
      dragRef.current = null
      setDrag((d) => {
        if (d && cur && d.end > d.start) setBooking({ start: d.start, end: Math.min(d.end, cur.seg.end) })
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [drag, client])

  // ── Verslepen van een bestaande afspraak ───────────────────────────────────
  // De afspraak volgt de muis, maar landt alleen als het nieuwe tijdvak binnen
  // wit valt. Zolang dat niet zo is, kleurt het blokje rood en doen we niets.
  const onApptDown = (e: React.MouseEvent, a: Appt, day: Date) => {
    e.preventDefault()
    e.stopPropagation()
    const s = new Date(a.starts_at).getTime(), en = new Date(a.ends_at).getTime()
    const col = (e.currentTarget as HTMLElement).parentElement
    if (!col) return
    const rect = col.getBoundingClientRect()
    const msAtCursor = dayTop(day) + ((e.clientY - rect.top) / PX_PER_MIN) * 60000
    moveRef.current = { id: a.id, duration: en - s, grabOffset: msAtCursor - s }
    setMoving({ id: a.id, start: s, end: en, valid: true })
  }

  useEffect(() => {
    if (!moving) return
    const slot = client?.slot_interval_min ?? 30
    const cols = Array.from(document.querySelectorAll<HTMLElement>('[data-daycol]'))

    const onMove = (ev: MouseEvent) => {
      const m = moveRef.current
      if (!m) return
      // Onder welke dagkolom hangt de muis?
      const col = cols.find((c) => {
        const r = c.getBoundingClientRect()
        return ev.clientX >= r.left && ev.clientX <= r.right
      })
      if (!col) return
      const dayMs = Number(col.dataset.daycol)
      const r = col.getBoundingClientRect()
      const raw = new Date(dayMs).setHours(DAY_START_H, 0, 0, 0) + ((ev.clientY - r.top) / PX_PER_MIN) * 60000
      const start = snapToSlot(raw - m.grabOffset, slot)
      const end = start + m.duration
      // Zelfde controle als de server doet — de eigen plek telt niet als blokkade.
      const own = appointments.find((a) => a.id === m.id)
      const segs = own
        ? [...segments, { start: new Date(own.starts_at).getTime(), end: new Date(own.ends_at).getTime() }]
        : segments
      setMoving({ id: m.id, start, end, valid: isBookable(segs, start, end) })
    }

    const onUp = () => {
      const m = moveRef.current
      moveRef.current = null
      setMoving((cur) => {
        if (cur && m && cur.valid) void commitMove(cur.id, cur.start, cur.end)
        return null
      })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moving, client, segments, appointments])

  const commitMove = async (id: string, start: number, end: number) => {
    try {
      const res = await fetch('/api/admin/sales/appointments', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, startsAt: start, endsAt: end }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success('Afspraak verplaatst.')
      load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Verplaatsen mislukt'); load() }
  }

  if (!client) {
    return <div className="card-base text-sm text-gray-600">Maak eerst een klant aan bij Pipeline → Nieuwe klant.</div>
  }

  return (
    <div className="space-y-4">
      {/* Kop: klant, week, koppeling */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <select className="input-base w-auto" value={clientId}
            onChange={(e) => { setClientId(e.target.value); setOwnerId('') }}>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* Wiens agenda? Bij één agenda is deze keuze overbodig. */}
          {owners.length > 1 && (
            <select className="input-base w-auto" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
              title="Voor wie boek je?">
              {owners.map((o) => <option key={o.id} value={o.id}>{o.name || o.account_email || 'Agenda'}</option>)}
            </select>
          )}
          <div className="flex items-center gap-1">
            <button onClick={() => setWeekStart(new Date(from - 7 * 86400000))} className="btn-secondary px-2" aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></button>
            <button onClick={() => setWeekStart(startOfWeek(new Date()))} className="btn-secondary text-sm">Deze week</button>
            <button onClick={() => setWeekStart(new Date(from + 7 * 86400000))} className="btn-secondary px-2" aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <span className="text-sm text-gray-600">
            {days[0].toLocaleDateString('nl-BE', { day: 'numeric', month: 'short' })} – {days[6].toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowAvailability(true)} className="btn-secondary text-sm" title="Werkuren, buffers en boekingsregels">
            <Settings2 className="h-4 w-4" />Beschikbaarheid
          </button>
          {connected && (
            <span className="status-badge bg-green-100 text-green-700 flex items-center gap-1"><Link2 className="h-3 w-3" />Gekoppeld</span>
          )}
          {/* Meerdere agenda's: elke persoon koppelt zijn eigen Google-account. */}
          <button
            onClick={() => {
              const naam = prompt('Van wie is deze agenda? (bv. Bram of Marco)')
              if (naam === null) return
              window.location.href = `/api/admin/sales/calendar/connect?client=${clientId}&name=${encodeURIComponent(naam.trim())}`
            }}
            className={owners.length === 0 ? 'btn-primary text-sm' : 'btn-secondary text-sm'}>
            <Link2 className="h-4 w-4" />{owners.length === 0 ? 'Google Agenda koppelen' : 'Agenda toevoegen'}
          </button>
        </div>
      </div>

      {owners.length === 0 && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Nog geen agenda gekoppeld. Zonder agenda zien we geen bezette momenten en kan er niet geboekt worden.
          Koppel per persoon (Bram, Marco, ...) een eigen Google-agenda.
        </p>
      )}

      {/* Kalender */}
      <div className="card-base p-0 overflow-hidden">
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-gray-100">
          <div />
          {days.map((d, i) => (
            <div key={i} className="px-2 py-2 text-center border-l border-gray-100">
              <div className="text-[11px] text-gray-500 uppercase">{d.toLocaleDateString('nl-BE', { weekday: 'short' })}</div>
              <div className="text-sm font-semibold">{d.getDate()}</div>
            </div>
          ))}
        </div>

        <div className="relative overflow-x-auto">
          <div className="grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: gridHeight }}>
            {/* Uren links */}
            <div className="relative">
              {Array.from({ length: DAY_END_H - DAY_START_H }, (_, i) => (
                <div key={i} className="absolute right-1 text-[10px] text-gray-400" style={{ top: i * 60 * PX_PER_MIN - 5 }}>
                  {String(DAY_START_H + i).padStart(2, '0')}:00
                </div>
              ))}
            </div>

            {days.map((day, di) => (
              <div key={di} data-daycol={day.getTime()} className="relative border-l border-gray-100 bg-gray-100">
                {/* Grijs: alles wat niet boekbaar is, als één samensmeltend geheel */}
                {greyByDay[di].map((g, gi) => {
                  const top = Math.max(0, yOf(g.start, day))
                  const bottom = Math.min(gridHeight, yOf(g.end, day))
                  if (bottom <= 0 || top >= gridHeight) return null
                  return <div key={gi} className="absolute inset-x-0 bg-gray-100" style={{ top, height: bottom - top }} />
                })}

                {/* Wit: enkel hierop kun je slepen */}
                {segments.map((seg, si) => {
                  const dayS = day.getTime(), dayE = dayS + 86400000
                  if (seg.end <= dayS || seg.start >= dayE) return null
                  const s = Math.max(seg.start, dayS), e = Math.min(seg.end, dayE)
                  const top = Math.max(0, yOf(s, day))
                  const bottom = Math.min(gridHeight, yOf(e, day))
                  if (bottom <= top) return null
                  return (
                    <div
                      key={si}
                      data-seg={si}
                      onMouseDown={(ev) => onSegmentDown(ev, { start: s, end: e }, day, si)}
                      title="Sleep om een afspraak te boeken"
                      className="absolute inset-x-0 bg-white cursor-crosshair hover:bg-amber-50/40 transition-colors"
                      style={{ top, height: bottom - top }}
                    />
                  )
                })}

                {/* Actieve sleep-selectie */}
                {drag && segments[drag.segIdx] && drag.start >= day.getTime() && drag.start < day.getTime() + 86400000 && (
                  <div className="absolute inset-x-0.5 rounded bg-amber-300/70 border border-amber-500 pointer-events-none flex items-center justify-center"
                    style={{ top: yOf(drag.start, day), height: Math.max(14, yOf(drag.end, day) - yOf(drag.start, day)) }}>
                    <span className="text-[10px] font-semibold text-amber-900">{hhmm(drag.start)}–{hhmm(drag.end)}</span>
                  </div>
                )}

                {/* Bestaande afspraken bovenop */}
                {appointments.filter((a) => {
                  const s = new Date(a.starts_at).getTime()
                  return s >= day.getTime() && s < day.getTime() + 86400000
                }).map((a) => {
                  const dragging = moving?.id === a.id
                  // Tijdens het slepen volgt het blokje de muis; anders staat het
                  // op zijn echte tijd.
                  const s = dragging ? moving!.start : new Date(a.starts_at).getTime()
                  const e = dragging ? moving!.end : new Date(a.ends_at).getTime()
                  if (dragging && (s < day.getTime() || s >= day.getTime() + 86400000)) return null
                  const tone = dragging
                    ? (moving!.valid ? 'bg-amber-300 border-amber-600' : 'bg-red-200 border-red-500')
                    : 'bg-[#fff848] border-yellow-500'
                  return (
                    <div key={a.id}
                      onMouseDown={(ev) => onApptDown(ev, a, day)}
                      className={`absolute inset-x-0.5 rounded border px-1 py-0.5 overflow-hidden cursor-grab active:cursor-grabbing ${tone}`}
                      style={{ top: yOf(s, day), height: Math.max(16, yOf(e, day) - yOf(s, day)), zIndex: dragging ? 20 : 10 }}
                      title={`${a.company ?? 'Afspraak'} — ${hhmm(s)}–${hhmm(e)} · sleep om te verplaatsen`}>
                      <div className="text-[10px] font-semibold text-black truncate flex items-center gap-0.5">
                        <Move className="h-2.5 w-2.5 shrink-0 opacity-50" />{a.company ?? 'Afspraak'}
                      </div>
                      <div className="text-[9px] text-black/70 truncate">{hhmm(s)}–{hhmm(e)}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {loading && (
            <div className="absolute inset-0 bg-white/60 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          )}
        </div>
      </div>

      <p className="text-[11px] text-gray-500">
        <span className="inline-block h-2.5 w-2.5 bg-white border border-gray-300 align-middle mr-1" /> vrij — sleep hierop om te boeken ·
        <span className="inline-block h-2.5 w-2.5 bg-gray-100 border border-gray-300 align-middle mx-1" /> niet beschikbaar (buiten werkuren, bezet of buffer)
      </p>

      {booking && (
        <BookingPanel
          clientId={clientId}
          start={booking.start}
          end={booking.end}
          leads={leads}
          initialLeadId={initialLeadId}
          ownerId={ownerId}
          ownerName={owners.find((o) => o.id === ownerId)?.name ?? null}
          onClose={() => setBooking(null)}
          onBooked={() => { setBooking(null); load() }}
        />
      )}

      {showAvailability && (
        <AvailabilityPanel
          clientId={clientId}
          clientName={client.name}
          initialOwnerId={ownerId}
          onClose={() => setShowAvailability(false)}
          onSaved={() => { setShowAvailability(false); load() }}
        />
      )}

      {appointments.length > 0 && (
        <AppointmentList appointments={appointments} onChanged={load} />
      )}
    </div>
  )
}

// ── Boekingspaneel ───────────────────────────────────────────────────────────
function BookingPanel({ clientId, ownerId, ownerName, start, end, leads, initialLeadId, onClose, onBooked }: {
  clientId: string; ownerId: string; ownerName: string | null
  start: number; end: number
  leads: LeadOption[]; initialLeadId?: string
  onClose: () => void; onBooked: () => void
}) {
  const [leadId, setLeadId] = useState(initialLeadId ?? '')
  const [email, setEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [clientNote, setClientNote] = useState('')
  const [withMeet, setWithMeet] = useState(true)
  const [saving, setSaving] = useState(false)

  const lead = leads.find((l) => l.id === leadId)

  const book = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/sales/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          salesClientId: clientId, ownerId: ownerId || null, startsAt: start, endsAt: end,
          leadId: leadId || null, attendeeEmail: email.trim() || null,
          notes, clientNote, withMeet,
        }),
      })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success(leadId ? 'Geboekt. De lead staat nu op “Afspraak ingepland”.' : 'Afspraak geboekt.')
      onBooked()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Boeken mislukt') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90dvh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div>
            <h3 className="font-semibold text-gray-900 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-gray-400" />Afspraak boeken</h3>
            <p className="text-sm text-gray-600 mt-0.5">
              {new Date(start).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long' })} · {hhmm(start)}–{hhmm(end)}
            </p>
          </div>
          <button onClick={onClose} className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-5 space-y-3 overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Lead koppelen <span className="text-gray-400">— optioneel</span></label>
            <select className="input-base" value={leadId} onChange={(e) => setLeadId(e.target.value)}>
              <option value="">Geen lead koppelen</option>
              {leads.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
            {leadId && <p className="text-[11px] text-gray-500 mt-1">Deze lead springt na het boeken naar “Afspraak ingepland”.</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">E-mail prospect</label>
            <input type="email" className="input-base" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder={lead?.email ?? 'naam@bedrijf.be'} />
            <p className="text-[11px] text-gray-500 mt-1">
              Leeg laten = het adres van de lead. Vul je een ander adres in, dan wordt dat ook in de pipeline bijgewerkt.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={withMeet} onChange={(e) => setWithMeet(e.target.checked)} className="h-4 w-4 rounded border-gray-300 accent-[#fff848]" />
            <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-gray-400" />Google Meet-link toevoegen</span>
          </label>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notitie</label>
            <textarea rows={2} className="input-base" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Extra notitie voor de klant</label>
            <textarea rows={2} className="input-base" value={clientNote} onChange={(e) => setClientNote(e.target.value)} />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-2">
          <button onClick={book} disabled={saving} className="btn-primary flex-1">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}Boek &amp; sync met Google
          </button>
          <button onClick={onClose} className="btn-secondary">Annuleer</button>
        </div>
      </div>
    </div>
  )
}

// ── Lijst met geboekte afspraken (annuleren) ─────────────────────────────────
function AppointmentList({ appointments, onChanged }: { appointments: Appt[]; onChanged: () => void }) {
  const cancel = async (id: string) => {
    if (!confirm('Deze afspraak annuleren? Het agenda-item wordt verwijderd.')) return
    try {
      const res = await fetch(`/api/admin/sales/appointments?id=${id}`, { method: 'DELETE' })
      const j = await res.json(); if (!res.ok) throw new Error(j.error)
      toast.success('Afspraak geannuleerd.')
      onChanged()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Annuleren mislukt') }
  }
  return (
    <div className="card-base p-0 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 text-sm font-medium">Afspraken deze week ({appointments.length})</div>
      <div className="divide-y divide-gray-50">
        {appointments.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{a.company ?? 'Afspraak'}{a.contact ? ` · ${a.contact}` : ''}</div>
              <div className="text-xs text-gray-500">
                {new Date(a.starts_at).toLocaleDateString('nl-BE', { weekday: 'short', day: 'numeric', month: 'short' })} · {hhmm(new Date(a.starts_at).getTime())}–{hhmm(new Date(a.ends_at).getTime())}
              </div>
            </div>
            <button onClick={() => cancel(a.id)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600" title="Annuleren">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
