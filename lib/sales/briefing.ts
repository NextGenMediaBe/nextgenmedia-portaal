/**
 * De omschrijving die in het Google-agenda-item belandt.
 *
 * De closer opent 's ochtends zijn agenda en moet dan alles weten: waar hij
 * moet zijn, wie hij spreekt, welk nummer hij belt als hij vastzit in het
 * verkeer, en wat de setter aan de telefoon gehoord heeft. Hij mag daarvoor
 * niet de app in hoeven.
 *
 * Bewust platte tekst met vaste kopjes: Google Agenda toont dit in een klein
 * venster op een telefoon, en opmaak overleeft dat niet.
 *
 * Los van de rest zodat het te testen is: een omschrijving die halverwege
 * afbreekt of een leeg kopje toont merk je anders pas als de closer voor een
 * dichte deur staat.
 */

export type BriefingInput = {
  bedrijf?: string | null
  contact?: string | null
  telefoon?: string | null
  email?: string | null
  adres?: string | null
  merk?: string | null
  setter?: string | null
  /** Wat de setter aan de telefoon gehoord heeft. */
  briefing?: string | null
  /** Extra opmerking die ook voor de prospect bedoeld is. */
  klantNotitie?: string | null
  meetUrl?: string | null
}

const schoon = (v: string | null | undefined): string => (v ?? '').trim()

export function bouwAgendaOmschrijving(i: BriefingInput): string {
  const blokken: string[] = []

  const wie = [
    schoon(i.contact) && `Contact: ${schoon(i.contact)}`,
    schoon(i.telefoon) && `Telefoon: ${schoon(i.telefoon)}`,
    schoon(i.email) && `E-mail: ${schoon(i.email)}`,
  ].filter(Boolean) as string[]
  if (wie.length) blokken.push(wie.join('\n'))

  // Het adres staat óók in het location-veld van Google, maar niet elke
  // weergave toont dat. Hier herhalen kost niets en scheelt zoeken.
  if (schoon(i.adres)) blokken.push(`Adres:\n${schoon(i.adres)}`)

  const context = [
    schoon(i.merk) && `Voor: ${schoon(i.merk)}`,
    schoon(i.setter) && `Ingeboekt door: ${schoon(i.setter)}`,
  ].filter(Boolean) as string[]
  if (context.length) blokken.push(context.join('\n'))

  if (schoon(i.briefing)) blokken.push(`Briefing van de setter:\n${schoon(i.briefing)}`)
  if (schoon(i.klantNotitie)) blokken.push(`Afgesproken met de prospect:\n${schoon(i.klantNotitie)}`)
  if (schoon(i.meetUrl)) blokken.push(`Online: ${schoon(i.meetUrl)}`)

  return blokken.join('\n\n')
}

/** Titel van het agenda-item. Kort genoeg om op een telefoon leesbaar te zijn. */
export function bouwAgendaTitel(i: BriefingInput): string {
  const bedrijf = schoon(i.bedrijf) || 'Prospect'
  const merk = schoon(i.merk)
  return merk ? `${bedrijf} — ${merk}` : `Afspraak — ${bedrijf}`
}
