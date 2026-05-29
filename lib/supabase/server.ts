import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createClient as createAdminClient, type SupabaseClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

export async function createClient() {
  const cookieStore = await cookies()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: unknown }) =>
              cookieStore.set(name, value, options as Parameters<typeof cookieStore.set>[2])
            )
          } catch {
            // Server Component — cookies worden genegeerd
          }
        },
      },
    }
  )
}

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is niet ingesteld')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createAdminClient<any>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Server-side admin guard. Returns the authenticated User when the caller has
 * the `admin` role, otherwise null. Use as: `const user = await requireAdmin();
 * if (!user) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })`.
 */
export async function requireAdmin(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()
  return data?.role === 'admin' ? user : null
}

/**
 * Best-effort signed URL. Returns null on any failure (missing object, bucket,
 * network error). Use for non-critical previews/downloads where the caller
 * gracefully handles a null URL.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function trySignedUrl(admin: SupabaseClient<any>, bucket: string, path: string | null | undefined, ttlSeconds = 3600): Promise<string | null> {
  if (!path) return null
  try {
    const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, ttlSeconds)
    if (error) return null
    return data?.signedUrl ?? null
  } catch {
    return null
  }
}
