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

/**
 * Insert a row, automatically dropping any column the live schema doesn't have.
 * PostgREST reports a missing column as code PGRST204 with the column name in the
 * message. We strip that column and retry, so a write succeeds regardless of which
 * migrations have been applied. Returns the same shape as a normal insert().select().
 *
 * Pass `required` to guarantee certain keys are never dropped (if one of those is
 * missing the error is surfaced instead of silently swallowed).
 */
export async function insertResilient(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: SupabaseClient<any>,
  table: string,
  payload: Record<string, unknown>,
  options?: { select?: string; required?: string[] },
): Promise<{ data: Record<string, unknown> | null; error: { message: string } | null }> {
  const selectCols = options?.select ?? 'id'
  const required = new Set(options?.required ?? [])
  const working = { ...payload }
  const maxAttempts = Object.keys(working).length + 1

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const { data, error } = await admin
      .from(table)
      .insert(working)
      .select(selectCols)
      .single()

    if (!error) return { data: (data as unknown) as Record<string, unknown>, error: null }

    // Detect "column X does not exist" / schema-cache miss
    const code = (error as { code?: string }).code
    const msg = error.message ?? ''
    const isMissingColumn =
      code === 'PGRST204' ||
      code === '42703' ||
      /could not find the '.*' column|column .* does not exist/i.test(msg)

    if (!isMissingColumn) return { data: null, error }

    // Extract the offending column name from the message
    const match = msg.match(/'([^']+)' column/i) || msg.match(/column "?([a-z0-9_]+)"?/i)
    const badCol = match?.[1]

    if (!badCol || !(badCol in working) || required.has(badCol)) {
      // Can't recover — surface the error
      return { data: null, error }
    }

    delete working[badCol]
  }

  return { data: null, error: { message: 'Insert mislukt na meerdere pogingen' } }
}
