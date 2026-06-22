import { NextRequest, NextResponse } from 'next/server'
import { runBlogScheduler } from '@/lib/blog-generate'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Dagelijkse bloggeneratie. Beveiligd met CRON_SECRET (Vercel Cron stuurt dit
// als Authorization: Bearer <secret>). Genereert blogs voor klanten die vandaag
// aan de beurt zijn, mailt admins en schuift de volgende generatiedatum op.
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if (req.headers.get('authorization') === `Bearer ${secret}`) return true
  return req.nextUrl.searchParams.get('key') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: 'Niet geautoriseerd' }, { status: 401 })
  const res = await runBlogScheduler()
  return NextResponse.json({ ok: true, ...res })
}
