'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

// Interne visuele maandplanning voor NextGenMedia. Puur informatief: toont per
// WERKDAG (ma–vr) welke fase van de workflow actief is, herberekend vanaf de
// eerste werkdag van de geselecteerde maand. Geen taakbeheer, geen opslag.

type CatKey = 'scripts' | 'intakes' | 'shoots' | 'edit' | 'feedback' | 'aanpassingen' | 'stats'

const CATS: Record<CatKey, {
  label: string; short: string; desc: string; dot: string; chip: string; summary: string
}> = {
  scripts: {
    label: 'Scripts & Contentideeën', short: 'Scripts', desc: 'Contentideeën + scripts, kalenders invullen',
    dot: 'bg-yellow-400', chip: 'bg-yellow-100 text-yellow-800 border-yellow-300', summary: 'dagen scripts',
  },
  intakes: {
    label: 'Intakes & Meetings', short: 'Intakes', desc: 'Intakes, onboarding, meetings, statistieken bespreken',
    dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700 border-blue-200', summary: 'intakedagen',
  },
  shoots: {
    label: 'Contentshoots', short: 'Shoot', desc: 'Contentshoots',
    dot: 'bg-purple-500', chip: 'bg-purple-100 text-purple-700 border-purple-200', summary: 'shootdagen',
  },
  edit: {
    label: 'Editen & Inplannen', short: 'Edit', desc: 'Editen + content inplannen in Metricool',
    dot: 'bg-green-500', chip: 'bg-green-100 text-green-700 border-green-200', summary: 'editdagen',
  },
  feedback: {
    label: 'Klantfeedback', short: 'Feedback', desc: 'Klanten kunnen feedback geven',
    dot: 'bg-orange-500', chip: 'bg-orange-100 text-orange-700 border-orange-200', summary: 'feedbackdagen',
  },
  aanpassingen: {
    label: 'Aanpassingen verwerken', short: 'Aanpass.', desc: 'Aanpassingen verwerken',
    dot: 'bg-red-500', chip: 'bg-red-100 text-red-700 border-red-200', summary: 'aanpassingsdagen',
  },
  stats: {
    label: 'Statistieken', short: 'Stats', desc: 'Statistieken vorige maand versturen',
    dot: 'bg-gray-900', chip: 'bg-gray-900 text-white border-gray-900', summary: 'statistiekendag',
  },
}

const ORDER: CatKey[] = ['scripts', 'intakes', 'shoots', 'edit', 'feedback', 'aanpassingen', 'stats']
const WEEKDAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

/** Categorieën voor werkdag-index i (1-based) van in totaal `total` werkdagen. */
function categoriesForWorkday(i: number, total: number): CatKey[] {
  const c: CatKey[] = []
  if (i >= 1 && i <= 2) c.push('scripts')
  if (i >= 3 && i <= 5) c.push('intakes')
  if (i >= 6 && i <= 13) c.push('shoots')
  if (i >= 11 && i <= 18) c.push('edit')
  if (i >= 19 && i <= 21) c.push('feedback')
  if (i >= 19 && i <= 22) c.push('aanpassingen')
  if (i === total) c.push('stats')   // laatste werkdag = statistieken versturen
  return c
}

const isWeekday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

function startOfMonthGrid(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1)
  const dow = (first.getDay() + 6) % 7 // maandag = 0
  return new Date(first.getFullYear(), first.getMonth(), 1 - dow)
}

export default function MaandplanningPage() {
  const [cursor, setCursor] = useState(() => new Date())

  // Map elke werkdag-datum → categorieën, herberekend per maand.
  const { byDay, counts } = useMemo(() => {
    const y = cursor.getFullYear(); const m = cursor.getMonth()
    const workdays: Date[] = []
    const d = new Date(y, m, 1)
    while (d.getMonth() === m) { if (isWeekday(d)) workdays.push(new Date(d)); d.setDate(d.getDate() + 1) }
    const total = workdays.length

    const byDay = new Map<string, CatKey[]>()
    const counts: Record<CatKey, number> = { scripts: 0, intakes: 0, shoots: 0, edit: 0, feedback: 0, aanpassingen: 0, stats: 0 }
    workdays.forEach((day, idx) => {
      const cats = categoriesForWorkday(idx + 1, total)
      byDay.set(ymd(day), cats)
      for (const c of cats) counts[c]++
    })
    return { byDay, counts }
  }, [cursor])

  const days = useMemo(() => {
    const start = startOfMonthGrid(cursor)
    return Array.from({ length: 42 }, (_, i) => {
      const x = new Date(start); x.setDate(start.getDate() + i); return x
    })
  }, [cursor])

  const title = cursor.toLocaleDateString('nl-BE', { month: 'long', year: 'numeric' })
  const navigate = (delta: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1))
  const todayStr = ymd(new Date())

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold">Maandplanning</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Welke fase van onze workflow actief is per werkdag — automatisch berekend vanaf de eerste werkdag van de maand
        </p>
      </div>

      {/* Samenvatting */}
      <div className="card-base">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Deze maand</div>
        <div className="flex flex-wrap gap-2">
          {ORDER.map((k) => (
            <span key={k} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium ${CATS[k].chip}`}>
              <span className="font-bold">{counts[k]}</span> {CATS[k].summary}
            </span>
          ))}
        </div>
      </div>

      {/* Kalender */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        {/* Maandselectie */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Vorige maand">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => setCursor(new Date())} className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
              Deze maand
            </button>
            <button onClick={() => navigate(1)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-100" aria-label="Volgende maand">
              <ChevronRight className="h-4 w-4" />
            </button>
            <span className="ml-2 font-semibold capitalize text-sm flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-gray-400" />
              {title}
            </span>
          </div>
        </div>

        {/* Weekdagen */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {WEEKDAYS.map((w) => (
            <div key={w} className="text-center text-[10px] font-semibold text-gray-400 uppercase tracking-wider py-2">{w}</div>
          ))}
        </div>

        {/* Dagen */}
        <div className="grid grid-cols-7 grid-rows-6">
          {days.map((d, idx) => {
            const inMonth = d.getMonth() === cursor.getMonth()
            const weekday = isWeekday(d)
            const cats = inMonth && weekday ? (byDay.get(ymd(d)) ?? []) : []
            const isToday = ymd(d) === todayStr
            return (
              <div
                key={idx}
                className={`border-r border-b border-gray-100 p-1.5 min-h-[84px] flex flex-col gap-1
                  ${!inMonth ? 'bg-gray-50/40' : !weekday ? 'bg-gray-50/70' : ''}`}
              >
                <span className={`text-[11px] font-medium px-1 py-0.5 rounded-full w-fit
                  ${isToday ? 'bg-[#fff848] text-black font-bold' : inMonth ? 'text-gray-700' : 'text-gray-300'}`}>
                  {d.getDate()}
                </span>
                <div className="flex flex-col gap-0.5 overflow-hidden">
                  {cats.map((c) => (
                    <span
                      key={c}
                      title={CATS[c].desc}
                      className={`text-[10px] leading-tight px-1.5 py-0.5 rounded border truncate ${CATS[c].chip}`}
                    >
                      {CATS[c].short}
                    </span>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Legende */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 px-4 py-3 border-t border-gray-100">
          {ORDER.map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] text-gray-600">
              <span className={`h-2.5 w-2.5 rounded-full ${CATS[k].dot}`} />
              <span className="font-medium">{CATS[k].label}</span>
              <span className="text-gray-400 hidden sm:inline">— {CATS[k].desc}</span>
            </span>
          ))}
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Weekends tellen niet mee. De fases worden geteld per werkdag vanaf de eerste werkdag van de maand; sommige
        werkdagen vallen onder twee fases (bv. shoots + editen). Puur ter info — er wordt niets opgeslagen.
      </p>
    </div>
  )
}
