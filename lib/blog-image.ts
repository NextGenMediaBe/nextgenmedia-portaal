import 'server-only'

// Gratis stockfoto's via Pexels (https://www.pexels.com/api/). Commercieel vrij
// te gebruiken, geen naamsvermelding vereist. Best-effort: zonder PEXELS_API_KEY
// of bij een fout geeft dit null terug — de bloggeneratie loopt altijd door.

/**
 * Zoekt één passende landschapsfoto. Retourneert een hotlinkbare CDN-URL of null.
 * Met `{ random: true }` wordt telkens een andere foto gekozen (voor "andere foto").
 */
export async function findStockImage(query: string | null | undefined, opts?: { random?: boolean }): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  const q = (query ?? '').trim()
  if (!key || !q) return null
  try {
    const perPage = opts?.random ? 15 : 1
    const page = opts?.random ? 1 + Math.floor(Math.random() * 3) : 1
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=${perPage}&page=${page}&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photos = (json?.photos ?? []) as any[]
    if (photos.length === 0) return null
    const photo = opts?.random ? photos[Math.floor(Math.random() * photos.length)] : photos[0]
    const src = photo?.src
    return src?.landscape || src?.large || src?.original || null
  } catch {
    return null
  }
}
