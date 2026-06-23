import 'server-only'
import { createAdminSupabaseClient } from '@/lib/supabase/server'
import { sendEmail, getAdminEmails, baseUrl } from '@/lib/email'
import { buildEmailHtml, buildEmailText } from '@/lib/email-html'
import { generateBlog, slugify } from '@/lib/blog-ai'
import { nextGenerationDate, todayISO } from '@/lib/blog-dates'
import { analyzeWebsite } from '@/lib/website-analyze'

export type BlogAccount = {
  id: string; name: string; website_url: string | null; briefing: string | null
  aantal_per_cyclus: number | null; frequentie_maanden: number | null
  volgende_generatie_datum: string | null; client_id: string | null
}

/** Genereert `count` blogs voor een blogaccount; opslaan als klaar_voor_review. */
export async function generateBlogsForAccount(account: BlogAccount, count: number): Promise<{ id: string; titel: string }[]> {
  const admin = createAdminSupabaseClient()

  const { data: recent } = await admin.from('blogs').select('titel, slug').eq('account_id', account.id).order('gegenereerd_op', { ascending: false }).limit(50)
  const recentTitles = (recent ?? []).map((b: { titel: string }) => b.titel).filter(Boolean)
  const usedSlugs = new Set((recent ?? []).map((b: { slug: string }) => b.slug))

  const websiteContent = await analyzeWebsite(account.website_url)

  const created: { id: string; titel: string }[] = []
  for (let i = 0; i < Math.max(1, count); i++) {
    const blog = await generateBlog({
      clientName: account.name, website: account.website_url, brandContext: account.briefing,
      websiteContent, recentTitles: [...recentTitles, ...created.map((c) => c.titel)],
    })
    let slug = blog.slug || slugify(blog.titel)
    let n = 2
    while (usedSlugs.has(slug)) { slug = `${blog.slug}-${n++}` }
    usedSlugs.add(slug)

    const { data, error } = await admin.from('blogs').insert({
      account_id: account.id, client_id: account.client_id ?? null,
      titel: blog.titel, slug, content: blog.content, meta_title: blog.meta_title,
      meta_description: blog.meta_description, thumbnail_url: blog.thumbnail_url, status: 'klaar_voor_review',
    }).select('id, titel').single()
    if (!error && data) created.push(data)
  }
  return created
}

/** Adminmail "Nieuwe blogs klaar voor review — {account}". Nooit naar klant. */
export async function sendBlogReviewMail(account: BlogAccount, blogs: { id: string; titel: string }[]): Promise<void> {
  if (blogs.length === 0) return
  try {
    const link = `${baseUrl()}/admin/blogs?account=${account.id}`
    const subject = `Nieuwe blogs klaar voor review — ${account.name}`
    const body = `Er staan ${blogs.length} nieuwe blog(s) klaar voor review voor ${account.name}.\n\n${blogs.map((b) => `• ${b.titel}`).join('\n')}`
    const html = buildEmailHtml({ bodyText: body, ctaText: 'Naar review', ctaLink: link })
    const text = buildEmailText({ bodyText: body, ctaText: 'Naar review', ctaLink: link })
    const recipients = await getAdminEmails()
    const res = await sendEmail({ to: recipients, subject, text, html })
    const admin = createAdminSupabaseClient()
    await admin.from('email_messages').insert({
      to_email: recipients.join(', '), to_client_id: account.client_id, subject, body, kind: 'blog_review', audience: 'admin',
      trigger_type: 'event', item_count: blogs.length, related_id: account.id,
      status: res.ok ? 'sent' : 'error', error: res.ok ? null : res.error, provider_id: res.id || null,
    })
  } catch { /* mail mag de generatie nooit breken */ }
}

/** Dagelijkse scheduler over blogaccounts. */
export async function runBlogScheduler(now = new Date()): Promise<{ accounts: number; blogs: number }> {
  const admin = createAdminSupabaseClient()
  const today = todayISO(now)
  const { data: due } = await admin.from('blog_accounts')
    .select('id, name, website_url, briefing, aantal_per_cyclus, frequentie_maanden, volgende_generatie_datum, client_id')
    .eq('active', true)
    .not('volgende_generatie_datum', 'is', null)
    .lte('volgende_generatie_datum', today)

  let totalBlogs = 0
  let accountCount = 0
  for (const a of (due ?? []) as BlogAccount[]) {
    const count = Math.max(1, a.aantal_per_cyclus ?? 1)
    const created = await generateBlogsForAccount(a, count)
    if (created.length > 0) { totalBlogs += created.length; accountCount++; await sendBlogReviewMail(a, created) }
    const base = a.volgende_generatie_datum ?? today
    const next = nextGenerationDate(base, a.frequentie_maanden ?? 1)
    await admin.from('blog_accounts').update({ volgende_generatie_datum: next }).eq('id', a.id)
  }
  return { accounts: accountCount, blogs: totalBlogs }
}
