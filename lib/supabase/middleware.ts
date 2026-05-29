import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Fetch role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const role = roleData?.role as string | undefined

  // Role-based routing
  if (path.startsWith('/admin') && role !== 'admin') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (path.startsWith('/portal') && role !== 'client') {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  if (path.startsWith('/partner') && role !== 'freelancer') {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  return supabaseResponse
}
