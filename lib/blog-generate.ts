import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail, getAdminEmails, baseUrl } from '@/lib/email'
import { buildEmailHtml, buildEmailText } from '@/lib/email-html'
import { generateBlog, slugify, type BlogInput } from '@/lib/blog-ai'
import { nextGenerationDate, todayISO } from '@/lib/blog-dates'

type ClientRow = {
  id: string; company_name: string; website_url: string | null; niche: string | null
  blog_brand_context: string | null; blog_aantal_per_cyclus: number | null
  blog_frequentie_maanden: number | null; blog_volgende_generatie_datum: string | null
}

/** Genereert `count` blogs voor een klant en slaat ze op als klaar_voor_review. */
export async function generateBlogsForClient(client: ClientRow, count: number): Promise<{ id: string; titel: string }[]> {
  const admin = createAdminSupabaseClient()

  // Recente titels + bestaande slugs (vermijd herhaling + duplicaten).
  const { data: recent } = await admin.from('blogs').select('titel, slug').eq('client_id', client.id).order('gegenereerd_op', { ascending: false }).limit(50)
  const recentTitles = (recent ?? []).map((b: { titel: string }) => b.titel).filter(Boolean)
  const usedSlugs = new Set((recent ?? []).map((b: { slug: string }) => b.slug))

  const input: BlogInput = {
    clientName: client.company_name,
    website: client.website_url,
    niche: client.niche,
    brandContext: client.blog_brand_context,
    recentTitles,
  }

  const created: { id: string; titel: string }[] = []
  for (let i = 0; i < Math.max(1, count); i++) {
    const blog = await generateBlog({ ...input, recentTitles: [...recentTitles, ...created.map((c) => c.titel)] })
    // Unieke slug binnen de klant garanderen.
    let slug = blog.slug || slugify(blog.titel)
    let n = 2
    while (usedSlugs.has(slug)) { slug = `${blog.slug}-${n++}` }
    usedSlugs.add(slug)

    const { data, error } = await admin.from('blogs').insert({
      client_id: client.id, titel: blog.titel, slug, content: blog.content,
      meta_title: blog.meta_title, meta_description: blog.meta_description, thumbnail_url: blog.thumbnail_url,
      status: 'klaar_voor_review',
    }).select('id, titel').single()
    if (!error && data) created.push(data)
  }
  return created
}

/** Adminmail "Nieuwe blogs klaar voor review — {klant}". Nooit naar klant. */
export async function sendBlogReviewMail(client: ClientRow, blogs: { id: string; titel: string }[]): Promise<void> {
  if (blogs.length === 0) return
  try {
    const link = `${baseUrl()}/admin/blogs?client=${client.id}`
    const subject = `Nieuwe blogs klaar voor review — ${client.company_name}`
    const body = `Er staan ${blogs.length} nieuwe blog(s) klaar voor review voor ${client.company_name}.\n\n${blogs.map((b) => `• ${b.titel}`).join('\n')}`
    const html = buildEmailHtml({ bodyText: body, ctaText: 'Naar review', ctaLink: link })
    const text = buildEmailText({ bodyText: body, ctaText: 'Naar review', ctaLink: link })
    const recipients = await getAdminEmails()
    const res = await sendEmail({ to: recipients, subject, text, html })
    const admin = createAdminSupabaseClient()
    await admin.from('email_messages').insert({
      to_email: recipients.join(', '), to_client_id: client.id, subject, body, kind: 'blog_review', audience: 'admin',
      trigger_type: 'event', item_count: blogs.length, related_id: client.id,
      status: res.ok ? 'sent' : 'error', error: res.ok ? null : res.error, provider_id: res.id || null,
    })
  } catch { /* mail mag de generatie nooit breken */ }
}

/** Dagelijkse scheduler: genereer blogs voor alle klanten die vandaag aan de beurt zijn. */
export async function runBlogScheduler(now = new Date()): Promise<{ clients: number; blogs: number }> {
  const admin = createAdminSupabaseClient()
  const today = todayISO(now)
  const { data: due } = await admin.from('clients')
    .select('id, company_name, website_url, niche, blog_brand_context, blog_aantal_per_cyclus, blog_frequentie_maanden, blog_volgende_generatie_datum')
    .eq('blogs_inbegrepen', true)
    .not('blog_volgende_generatie_datum', 'is', null)
    .lte('blog_volgende_generatie_datum', today)
    .is('archived_at', null)

  let totalBlogs = 0
  let clientCount = 0
  for (const c of (due ?? []) as ClientRow[]) {
    const count = Math.max(1, c.blog_aantal_per_cyclus ?? 1)
    const created = await generateBlogsForClient(c, count)
    if (created.length > 0) { totalBlogs += created.length; clientCount++; await sendBlogReviewMail(c, created) }
    // Volgende generatiedatum opschuiven met de frequentie (clamping op maandlengte).
    const base = c.blog_volgende_generatie_datum ?? today
    const next = nextGenerationDate(base, c.blog_frequentie_maanden ?? 1)
    await admin.from('clients').update({ blog_volgende_generatie_datum: next }).eq('id', c.id)
  }
  return { clients: clientCount, blogs: totalBlogs }
}
