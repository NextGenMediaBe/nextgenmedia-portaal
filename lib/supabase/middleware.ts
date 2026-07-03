import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { pathToModule, canSeeModule } from '@/lib/staff'
import { createAdminSupabaseClient } from '@/lib/supabase/server'

// Rol/rechten worden via de service-role client gelezen (bypasst RLS). Reden:
// user_roles heeft een RESTRICTIVE admin-only policy, waardoor een niet-admin
// zijn EIGEN rol-rij niet via de user-sessie kan lezen → role undefined →
// redirect-loop bij inloggen (werknemers). De service-role lezing is
// betrouwbaar en is sowieso het primaire beveiligingsmodel van dit platform.
// Valt terug op de user-client als de service-role key ontbreekt.
function roleReader(fallback: ReturnType<typeof createServerClient>) {
  try { return createAdminSupabaseClient() } catch { return fallback }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServerClient<any>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setAll(cookiesToSet: any[]) {
          cookiesToSet.forEach(({ name, value }: { name: string; value: string }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options?: unknown }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // Public routes
  if (
    path === '/login' ||
    path === '/' ||
    path.startsWith('/sign/') ||
    path.startsWith('/_next') ||
    path.startsWith('/api') ||
    path === '/favicon.ico'
  ) {
    return supabaseResponse
  }

  // Not logged in → redirect to login
  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    url.searchParams.set('redirect', path)
    return NextResponse.redirect(url)
  }

  // Fetch role (via service-role — zie roleReader hierboven)
  const db = roleReader(supabase)
  const { data: roleData } = await db
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const role = roleData?.role as string | undefined

  // Role-based routing
  if (path.startsWith('/admin')) {
    // Admin = volledige toegang. Werknemer = enkel toegestane modules.
    if (role === 'admin') {
      // ok
    } else if (role === 'employee') {
      // Werknemersbeheer is altijd admin-only.
      if (path.startsWith('/admin/werknemers')) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      const moduleKey = pathToModule(path)
      if (moduleKey) {
        const { data: staff } = await db
          .from('staff_members')
          .select('active, permissions')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        const active = staff?.active !== false
        const perms = Array.isArray(staff?.permissions) ? (staff!.permissions as string[]) : []
        if (!active) return NextResponse.redirect(new URL('/login', request.url))
        if (!canSeeModule(perms, moduleKey)) {
          return NextResponse.redirect(new URL('/admin', request.url))
        }
      }
    } else {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }
  if (path.startsWith('/portal') && role !== 'client') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (path.startsWith('/partner') && role !== 'freelancer') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}
