'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Sparkles, Eye, Clock, CheckCircle2 } from 'lucide-react'

export type CalEvent = { date: string; kind: 'generation' | 'review' | 'scheduled' | 'published'; titel: string; account: string }

const KIND: Record<CalEvent['kind'], { label: string; cls: string; dot: string; Icon: typeof Eye }> = {
  generation: { label: 'Generatie', cls: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500', Icon: Sparkles },
  review: { label: 'Review', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500', Icon: Eye },
  scheduled: { label: 'Gepland', cls: 'bg-purple-100 text-purple-700', dot: 'bg-purple-500', Icon: Clock },
  published: { label: 'Gepubliceerd', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500', Icon: CheckCircle2 },
}
const DOW = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MONTHS = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december']

const iso = (d: Date) => d.toISOString().slice(0, 10)
const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x }

export function BlogCalendar({ events }: { events: CalEvent[] }) {
  const [view, setView] = useState<'maand' | 'week' | 'lijst'>('maand')
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d })

  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>()
    for (const e of events) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date)!.push(e) }
    return m
  }, [events])

  const move = (dir: number) => {
    const d = new Date(cursor)
    if (view === 'week') d.setDate(d.getDate() + dir * 7)
    else d.setMonth(d.getMonth() + dir)
    setCursor(d)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <button onClick={() => move(-1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronLeft className="h-4 w-4" /></button>
          <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setCursor(d) }} className="btn-secondary text-xs">Vandaag</button>
          <button onClick={() => move(1)} className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"><ChevronRight className="h-4 w-4" /></button>
          <span className="ml-2 font-semibold text-sm">{view === 'week' ? `Week van ${startOfWeek(cursor).getDate()} ${MONTHS[startOfWeek(cursor).getMonth()]}` : `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}</span>
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
          {(['maand', 'week', 'lijst'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`px-3 py-1 text-xs rounded-md capitalize ${view === v ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{v}</button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-[11px] text-gray-500">
        {Object.entries(KIND).map(([k, v]) => <span key={k} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${v.dot}`} />{v.label}</span>)}
      </div>

      {view === 'lijst' ? <ListView byDate={byDate} /> : view === 'week' ? <WeekView cursor={cursor} byDate={byDate} /> : <MonthView cursor={cursor} byDate={byDate} />}
    </div>
  )
}

function EventChip({ e }: { e: CalEvent }) {
  const k = KIND[e.kind]
  return <div className={`truncate rounded px-1.5 py-0.5 text-[10px] ${k.cls}`} title={`${k.label} · ${e.account} · ${e.titel}`}>{e.titel}</div>
}

function MonthView({ cursor, byDate }: { cursor: Date; byDate: Map<string, CalEvent[]> }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const gridStart = startOfWeek(first)
  const todayIso = iso(new Date())
  const cells: Date[] = []
  for (let i = 0; i < 42; i++) { const d = new Date(gridStart); d.setDate(gridStart.getDate() + i); cells.push(d) }

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="grid grid-cols-7 bg-gray-50 text-[11px] font-medium text-gray-500">
        {DOW.map((d) => <div key={d} className="px-2 py-1.5 text-center">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const di = iso(d)
          const inMonth = d.getMonth() === cursor.getMonth()
          const evs = byDate.get(di) ?? []
          return (
            <div key={i} className={`min-h-[92px] border-t border-l border-gray-100 p-1.5 ${i % 7 === 0 ? '' : ''} ${inMonth ? '' : 'bg-gray-50/50'}`}>
              <div className={`text-[11px] mb-1 ${di === todayIso ? 'font-bold text-black' : inMonth ? 'text-gray-500' : 'text-gray-300'}`}>{di === todayIso ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-black text-white">{d.getDate()}</span> : d.getDate()}</div>
              <div className="space-y-0.5">
                {evs.slice(0, 4).map((e, j) => <EventChip key={j} e={e} />)}
                {evs.length > 4 && <div className="text-[10px] text-gray-400">+{evs.length - 4} meer</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WeekView({ cursor, byDate }: { cursor: Date; byDate: Map<string, CalEvent[]> }) {
  const start = startOfWeek(cursor)
  const todayIso = iso(new Date())
  const days: Date[] = []
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d) }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((d, i) => {
        const di = iso(d)
        const evs = byDate.get(di) ?? []
        return (
          <div key={i} className="rounded-xl border border-gray-200 p-2 min-h-[120px]">
            <div className={`text-xs mb-1.5 ${di === todayIso ? 'font-bold text-black' : 'text-gray-500'}`}>{DOW[i]} {d.getDate()}</div>
            <div className="space-y-1">
              {evs.map((e, j) => <EventChip key={j} e={e} />)}
              {evs.length === 0 && <div className="text-[10px] text-gray-300">—</div>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ byDate }: { byDate: Map<string, CalEvent[]> }) {
  const dates = [...byDate.keys()].sort()
  if (dates.length === 0) return <div className="card-base empty-state"><CalendarDays className="h-8 w-8 mx-auto mb-3 opacity-30" /><p className="text-sm">Geen geplande blogactiviteit.</p></div>
  return (
    <div className="space-y-2">
      {dates.map((di) => (
        <div key={di} className="card-base">
          <div className="text-xs font-medium text-gray-500 mb-2">{new Date(di).toLocaleDateString('nl-BE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          <div className="space-y-1">
            {(byDate.get(di) ?? []).map((e, j) => {
              const k = KIND[e.kind]
              return (
                <div key={j} className="flex items-center gap-2 text-sm">
                  <span className={`status-badge text-[10px] ${k.cls} flex items-center gap-1`}><k.Icon className="h-3 w-3" />{k.label}</span>
                  <span className="text-gray-700 truncate">{e.titel}</span>
                  <span className="text-xs text-gray-400 ml-auto shrink-0">{e.account}</span>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
