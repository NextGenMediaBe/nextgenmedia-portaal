import 'server-only'

// Gratis stockfoto's via Pexels (https://www.pexels.com/api/). Commercieel vrij
// te gebruiken, geen naamsvermelding vereist. Best-effort: zonder PEXELS_API_KEY
// of bij een fout geeft dit null terug — de bloggeneratie loopt altijd door.

/** Zoekt één passende landschapsfoto. Retourneert een hotlinkbare CDN-URL of null. */
export async function findStockImage(query: string | null | undefined): Promise<string | null> {
  const key = process.env.PEXELS_API_KEY
  const q = (query ?? '').trim()
  if (!key || !q) return null
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(q)}&per_page=1&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: key }, signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const json = await res.json()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const photo = (json?.photos ?? [])[0] as any
    const src = photo?.src
    return src?.landscape || src?.large || src?.original || null
  } catch {
    return null
  }
}
