// Klantgerichte maandplanning: de 8 fases waaraan klanten per maand gekoppeld
// kunnen worden, plus de twee intake-types. Puur (client-safe).

export type PhaseKey =
  | 'kalender_scripts'
  | 'intake_onboarding'
  | 'strategie_intake'
  | 'shoots'
  | 'content_maken'
  | 'feedback'
  | 'metricool'
  | 'statistieken'

export const PHASES: { key: PhaseKey; label: string; chip: string; dot: string }[] = [
  { key: 'kalender_scripts',  label: 'Contentkalender & Scripts', chip: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-400' },
  { key: 'intake_onboarding', label: 'Intake & Onboarding',       chip: 'bg-sky-100 text-sky-700 border-sky-200',        dot: 'bg-sky-500' },
  { key: 'strategie_intake',  label: 'Strategie Intake',          chip: 'bg-blue-100 text-blue-700 border-blue-200',     dot: 'bg-blue-600' },
  { key: 'shoots',            label: 'Contentshoots',             chip: 'bg-purple-100 text-purple-700 border-purple-200', dot: 'bg-purple-500' },
  { key: 'content_maken',     label: 'Content maken',             chip: 'bg-teal-100 text-teal-700 border-teal-200',     dot: 'bg-teal-500' },
  { key: 'feedback',          label: 'Feedback verwerken',        chip: 'bg-orange-100 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
  { key: 'metricool',         label: 'Metricool inplannen',       chip: 'bg-green-100 text-green-700 border-green-200',   dot: 'bg-green-500' },
  { key: 'statistieken',      label: 'Statistieken versturen',    chip: 'bg-gray-900 text-white border-gray-900',        dot: 'bg-gray-900' },
]

export const PHASE_LABEL: Record<string, string> = Object.fromEntries(PHASES.map((p) => [p.key, p.label]))
export const PHASE_KEYS = PHASES.map((p) => p.key)

export const PLANNING_TYPES: { key: string; label: string }[] = [
  { key: 'standaard',  label: 'Standaard' },
  { key: 'onboarding', label: 'Intake & Onboarding (nieuwe klant)' },
  { key: 'strategie',  label: 'Strategie Intake (nieuwe periode)' },
]
export const PLANNING_TYPE_LABEL: Record<string, string> = Object.fromEntries(PLANNING_TYPES.map((t) => [t.key, t.label]))

/** Doel-omschrijving per planning-type (voor tooltips/uitleg). */
export const PLANNING_TYPE_GOAL: Record<string, string> = {
  onboarding: 'Onboarden, platform & Metricool uitleggen, contentstrategie + eerste kalender en scripts bespreken.',
  strategie: 'Voorbije 3 maanden evalueren, statistieken bespreken, nieuwe focus bepalen, kalender volgende periode bespreken.',
  standaard: '',
}
