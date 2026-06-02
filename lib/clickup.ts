// ── ClickUp integratie (server-side only) ────────────────────────────────────
// App → ClickUp, één richting. Wordt UITSLUITEND server-side gebruikt; de API key
// komt enkel uit process.env.CLICKUP_API_KEY en mag nooit in client-code lekken.

const API_BASE = 'https://api.clickup.com/api/v2'

// Vaste omgeving (exact zoals aangeleverd)
export const CLICKUP_SPACE_ID = '90154938729' // NextGenMedia space

// Custom field IDs (workspace-breed, op alle lijsten aanwezig)
const FIELD = {
  caption: 'a5c04488-6da9-4f8f-ad62-75de0a088433',
  channel: '3a75dd8a-cbcc-41de-b02e-f602a4148419',
  link: '62b7394f-ae28-46f3-9ac1-dce63e3b38ed',
  publicatieDatum: '4e706dbc-6609-4d41-bdf5-d7b4baa5f0ef',
  sharedUrl: '9971653c-80c0-4775-acbd-e0545e080d20',
} as const

const CAPTION_OPTION = {
  af: '6eb2566a-fcc7-47d3-92b0-ca59b3adbd16',          // "Caption is af"
  nog: '26cfc2eb-840a-4ccf-8273-2a318ba5682a',         // "Caption nog schrijven"
} as const

const CHANNEL_OPTION = {
  facebook: '4958a028-e238-43e0-8fd6-044a20808e1a',
  twitter: '8c87acc5-c49d-4c34-8c58-4f2de80e6e89',
  youtube: '427cb857-2d58-4a9f-b959-f1f4309bf4c7',
  linkedin: '59c05846-9d4b-4ab9-9576-a5c89ce5d19f',
  instagram: '085dac55-cb72-4da7-a20d-56a85a5030b6',
  all: 'b8fb0948-8175-48f7-ab91-057624940068',
  email: '4ad93978-3ee7-4f9e-86d5-d14939f27264',
  google: 'f4fb9e74-489b-4aef-86e0-e9649e80f7be',
} as const

// ClickUp-statussen
const STATUS_NEW = 'to do'
const STATUS_DONE = 'complete'

// App-klantnaam → ClickUp-naam uitzonderingen
const NAME_EXCEPTIONS: Record<string, string> = {
  cash4goods: 'Cash4goods',
  core_tennis_camp: 'Core_Tennis_Camp',
}

export function clickupConfigured(): boolean {
  return !!process.env.CLICKUP_API_KEY
}

export function mapClientName(appName: string): string {
  const key = appName.trim().toLowerCase().replace(/\s+/g, '_')
  return NAME_EXCEPTIONS[key] ?? appName.trim()
}

// ── Titel / platform / field mapping ─────────────────────────────────────────

const CONTENT_TYPE_WORDS = ['reel', 'post', 'story', 'carousel']

/** Groepeer ruwe app-platformen naar ClickUp-labels (META/LINKEDIN/TIKTOK/…). */
function platformGroups(platforms: string[]): string[] {
  const norm = platforms.map((p) => p.trim().toLowerCase()).filter(Boolean)
  const groups: string[] = []
  const has = (p: string) => norm.includes(p)

  if (has('facebook') || has('instagram') || has('meta')) groups.push('META')
  if (has('linkedin')) groups.push('LINKEDIN')
  if (has('tiktok')) groups.push('TIKTOK')

  // Overige bekende kanalen, in voorkomende volgorde
  for (const p of norm) {
    if (['facebook', 'instagram', 'meta', 'linkedin', 'tiktok'].includes(p)) continue
    const label = p.toUpperCase()
    if (!groups.includes(label)) groups.push(label)
  }
  return groups
}

/** "(META & LINKEDIN)" — altijd hoofdletters, '&' als separator, tussen haakjes. */
export function formatPlatformSuffix(platforms: string[]): string {
  const groups = platformGroups(platforms)
  if (groups.length === 0) return '(ALL)'
  return `(${groups.join(' & ')})`
}

/** Strip een leidend contenttype-woord en een eventuele tijd-suffix ("— 14:00"). */
function cleanSubject(rawTitle: string, contentType: string): string {
  let s = (rawTitle ?? '').trim()
  // leidend type-woord weghalen (bv. "Post Welkom..." → "Welkom...")
  const lead = new RegExp(`^(${CONTENT_TYPE_WORDS.join('|')})\\b[\\s:–—-]*`, 'i')
  s = s.replace(lead, '')
  // ook het exacte contenttype (indien anders) vooraan weghalen
  if (contentType) {
    const t = new RegExp(`^${contentType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[\\s:–—-]*`, 'i')
    s = s.replace(t, '')
  }
  // trailing tijd " — 14:00" / " - 14:00" / " 14:00"
  s = s.replace(/\s*[—–-]?\s*\d{1,2}[:.]\d{2}\s*$/, '')
  return s.replace(/\s+/g, ' ').trim()
}

/** [CONTENTTYPE] [onderwerp] ([PLATFORM(S)]) — exact schrijfwijze. */
export function buildTaskTitle(item: {
  content_type: string
  title: string
  platforms: string[]
}): string {
  const type = (item.content_type || 'post').trim().toUpperCase()
  const subject = cleanSubject(item.title, item.content_type)
  const suffix = formatPlatformSuffix(item.platforms)
  return [type, subject, suffix].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
}

/** Channel-dropdown optie: één groep → bijhorende optie, meerdere → All. */
export function channelOptionId(platforms: string[]): string {
  const groups = platformGroups(platforms)
  if (groups.length !== 1) return CHANNEL_OPTION.all
  switch (groups[0]) {
    case 'META': return CHANNEL_OPTION.instagram   // META only → Instagram option
    case 'LINKEDIN': return CHANNEL_OPTION.linkedin
    case 'TWITTER': return CHANNEL_OPTION.twitter
    case 'YOUTUBE': return CHANNEL_OPTION.youtube
    case 'GOOGLE': return CHANNEL_OPTION.google
    case 'EMAIL': return CHANNEL_OPTION.email
    default: return CHANNEL_OPTION.all             // o.a. TIKTOK heeft geen optie
  }
}

export function captionOptionId(caption: string | null | undefined): string {
  return caption && caption.trim() ? CAPTION_OPTION.af : CAPTION_OPTION.nog
}

export function statusFor(appStatus: string): string {
  return appStatus === 'published' ? STATUS_DONE : STATUS_NEW
}

/** planned_date (YYYY-MM-DD) → unix ms (noon UTC, voorkomt dag-shift). */
export function plannedDateMs(plannedDate: string): number {
  return Date.parse(`${plannedDate.slice(0, 10)}T12:00:00Z`)
}

/** Stabiele, lichte hash van de gesyncte velden (skip onnodige API-calls). */
export function syncHash(parts: {
  name: string; captionOpt: string; channelOpt: string; dateMs: number; status: string
}): string {
  const s = `${parts.name}|${parts.captionOpt}|${parts.channelOpt}|${parts.dateMs}|${parts.status}`
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) >>> 0
  return h.toString(36)
}

// ── Rate-limited fetch (100 req/min) met exponential backoff bij 429 ──────────

let lastRequestAt = 0
const MIN_INTERVAL_MS = 650 // ~92 req/min, ruim onder de limiet
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function clickupFetch(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const key = process.env.CLICKUP_API_KEY
  if (!key) throw new Error('CLICKUP_API_KEY is niet ingesteld')

  const wait = lastRequestAt + MIN_INTERVAL_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequestAt = Date.now()

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: key,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (res.status === 429 && attempt < 5) {
    const retryAfter = Number(res.headers.get('retry-after') ?? 0)
    const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 1000, 16000)
    await sleep(backoff)
    return clickupFetch(path, init, attempt + 1)
  }
  return res
}

async function clickupJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await clickupFetch(path, init)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`ClickUp ${init?.method ?? 'GET'} ${path} → ${res.status}: ${text.slice(0, 300)}`)
  }
  return text ? (JSON.parse(text) as T) : ({} as T)
}

// ── Folder / list resolutie ──────────────────────────────────────────────────

type CuList = { id: string; name: string }
type CuFolder = { id: string; name: string; lists?: CuList[] }

const isContentkalender = (name: string) => /contentkalender\s*$/i.test(name.trim())

export type ClientListRef = { folderId: string; listId: string }

/**
 * Zoek (of maak) de klantstructuur in de NextGenMedia-space en geef folder+list id.
 *   Space → Folder: [Klantnaam] → List: [Klantnaam] CONTENTKALENDER
 */
export async function findOrCreateClientList(appClientName: string): Promise<ClientListRef> {
  const name = mapClientName(appClientName)

  const { folders } = await clickupJson<{ folders: CuFolder[] }>(`/space/${CLICKUP_SPACE_ID}/folder`)
  const folder = (folders ?? []).find((f) => f.name.trim().toLowerCase() === name.toLowerCase())

  if (folder) {
    let list = (folder.lists ?? []).find((l) => isContentkalender(l.name))
    if (!list) {
      list = await clickupJson<CuList>(`/folder/${folder.id}/list`, {
        method: 'POST',
        body: JSON.stringify({ name: `${name} CONTENTKALENDER` }),
      })
    }
    return { folderId: folder.id, listId: list.id }
  }

  // Nieuwe structuur aanmaken: folder + algemene lijst + CONTENTKALENDER-lijst
  const newFolder = await clickupJson<CuFolder>(`/space/${CLICKUP_SPACE_ID}/folder`, {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  // Algemene lijst [Klantnaam] (best effort — niet kritisch voor de sync)
  try {
    await clickupJson<CuList>(`/folder/${newFolder.id}/list`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    })
  } catch { /* niet fataal */ }

  const contentList = await clickupJson<CuList>(`/folder/${newFolder.id}/list`, {
    method: 'POST',
    body: JSON.stringify({ name: `${name} CONTENTKALENDER` }),
  })
  return { folderId: newFolder.id, listId: contentList.id }
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

export type CuTask = {
  id: string
  name: string
  due_date?: string | null
  custom_fields?: Array<{ id: string; value?: unknown }>
}

/** Alle (open + gesloten) taken in een lijst ophalen, met paginatie. */
export async function fetchListTasks(listId: string): Promise<CuTask[]> {
  const out: CuTask[] = []
  for (let page = 0; page < 50; page++) {
    const data = await clickupJson<{ tasks: CuTask[]; last_page?: boolean }>(
      `/list/${listId}/task?archived=false&include_closed=true&subtasks=false&page=${page}`,
    )
    const tasks = data.tasks ?? []
    out.push(...tasks)
    if (data.last_page || tasks.length === 0) break
  }
  return out
}

const normName = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')

/** Datum van een bestaande taak: due_date, anders het Publicatie datum-veld. */
function taskDateMs(t: CuTask): number | null {
  if (t.due_date != null && String(t.due_date) !== '') return Number(t.due_date)
  const cf = t.custom_fields?.find((f) => f.id === FIELD.publicatieDatum)?.value
  return cf != null ? Number(cf) : null
}

/**
 * Zoek een bestaande taak om te 'adopteren' — STRIKT op naam ÉN datum.
 * Terugkerende content kan dezelfde titel hebben op verschillende datums; die
 * mogen NOOIT samenvallen op één taak. Geen datum-match → null (nieuwe taak).
 */
export function findTaskByNameAndDate(tasks: CuTask[], name: string, dateMs: number): CuTask | null {
  const target = normName(name)
  const SAME_DAY = 30 * 3600 * 1000 // ~1,25 dag tolerantie (TZ-ruis)
  const match = tasks.find((t) => {
    if (normName(t.name) !== target) return false
    const tms = taskDateMs(t)
    return tms != null && Math.abs(tms - dateMs) < SAME_DAY
  })
  return match ?? null
}

export type TaskFields = {
  name: string
  status: string
  dateMs: number
  captionOpt: string
  channelOpt: string
}

export type TaskResult = { id: string; fieldsBlocked: number }

// We syncen bewust ALLEEN de titel (= WAT) + status + due_date (= WANNEER).
// Geen custom fields: die vallen onder de ClickUp-planlimiet (FIELD_033) en zijn
// niet nodig. due_date is een ingebouwd ClickUp-veld en telt NIET mee voor die
// limiet. fieldsBlocked blijft daarom altijd 0.

export async function createTask(listId: string, f: TaskFields): Promise<TaskResult> {
  const task = await clickupJson<{ id: string }>(`/list/${listId}/task`, {
    method: 'POST',
    body: JSON.stringify({ name: f.name, status: f.status, due_date: f.dateMs }),
  })
  return { id: task.id, fieldsBlocked: 0 }
}

export async function updateTask(taskId: string, f: TaskFields): Promise<TaskResult> {
  await clickupJson(`/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: f.name, status: f.status, due_date: f.dateMs }),
  })
  return { id: taskId, fieldsBlocked: 0 }
}
