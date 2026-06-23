// Genormaliseerde contractstatussen. We bewaren bestaande statuswaarden in de DB
// (draft/sent/viewed/signed/expired/cancelled/vervangen) ZONDER risicovolle datamigratie,
// en tonen overal de fase-2 vocabulaire. Oude én nieuwe waarden mappen op één canonieke key.

export type ContractStatusKey =
  | 'template'
  | 'klaar_voor_verzenden'
  | 'verzonden'
  | 'geopend'
  | 'ingevuld'
  | 'getekend'
  | 'geannuleerd'
  | 'verlopen'
  | 'vervangen'

export type ContractStatusInfo = { key: ContractStatusKey; label: string; cls: string }

const INFO: Record<ContractStatusKey, { label: string; cls: string }> = {
  template:             { label: 'Template',             cls: 'bg-purple-100 text-purple-700' },
  klaar_voor_verzenden: { label: 'Klaar voor verzenden', cls: 'bg-gray-100 text-gray-600' },
  verzonden:            { label: 'Verzonden',            cls: 'bg-blue-100 text-blue-700' },
  geopend:              { label: 'Geopend',              cls: 'bg-amber-100 text-amber-700' },
  ingevuld:             { label: 'Ingevuld',             cls: 'bg-amber-100 text-amber-700' },
  getekend:             { label: 'Getekend',             cls: 'bg-green-100 text-green-700' },
  geannuleerd:          { label: 'Geannuleerd',          cls: 'bg-gray-100 text-gray-500' },
  verlopen:             { label: 'Verlopen',             cls: 'bg-red-100 text-red-700' },
  vervangen:            { label: 'Vervangen',            cls: 'bg-orange-100 text-orange-700' },
}

// Oude/varianten → canonieke key.
const ALIAS: Record<string, ContractStatusKey> = {
  template: 'template',
  draft: 'klaar_voor_verzenden',
  klaar_voor_verzenden: 'klaar_voor_verzenden',
  sent: 'verzonden',
  verzonden: 'verzonden',
  viewed: 'geopend',
  geopend: 'geopend',
  opened: 'geopend',
  ingevuld: 'ingevuld',
  filled: 'ingevuld',
  signed: 'getekend',
  getekend: 'getekend',
  cancelled: 'geannuleerd',
  canceled: 'geannuleerd',
  geannuleerd: 'geannuleerd',
  expired: 'verlopen',
  verlopen: 'verlopen',
  vervangen: 'vervangen',
  replaced: 'vervangen',
}

/** Canonieke key voor een opgeslagen status (oud of nieuw). */
export function canonicalStatus(status: string | null | undefined): ContractStatusKey {
  if (!status) return 'klaar_voor_verzenden'
  return ALIAS[status.toLowerCase()] ?? 'klaar_voor_verzenden'
}

/** Label + stijl voor weergave. */
export function statusInfo(status: string | null | undefined): ContractStatusInfo {
  const key = canonicalStatus(status)
  return { key, ...INFO[key] }
}

/** Filteropties (canonieke keys) voor de admin-lijst. */
export const STATUS_FILTER_OPTIONS: { value: ContractStatusKey; label: string }[] = [
  { value: 'klaar_voor_verzenden', label: 'Klaar voor verzenden' },
  { value: 'verzonden',            label: 'Verzonden' },
  { value: 'geopend',              label: 'Geopend' },
  { value: 'getekend',             label: 'Getekend' },
  { value: 'verlopen',             label: 'Verlopen' },
  { value: 'geannuleerd',          label: 'Geannuleerd' },
  { value: 'vervangen',            label: 'Vervangen' },
]

/** Contracttemplate-categorieën (vaste lijst). */
export const TEMPLATE_CATEGORIES = [
  'Social Media pakket 1',
  'Social Media pakket 2',
  'Social Media pakket 3',
  'Webdesign',
  'Branding',
  'Fotografie',
  'Videografie',
  'Marketing Consultancy',
  'Partnerovereenkomst',
  'Overige',
] as const
