import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase session on every request by exchanging the
 * expired access token for a fresh one using the stored refresh token.
 *
 * Place at `middleware.ts` in the project root (Next.js convention).
 * Runs before every matched route.
 */
export async function proxy(request: NextRequest) {
  // Skip static assets and Next internals
  if (
    request.nextUrl.pathname.startsWith('/_next') ||
    request.nextUrl.pathname.startsWith('/api/poll') ||
    request.nextUrl.pathname.includes('.')
  ) {
    return NextResponse.next()
  }

  const response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // getUser() validates the JWT server-side; if expired, the proxy
  // refreshes it automatically via the cookies setAll callback above.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protect /dashboard and /settings — redirect to /login if not authed
  if (
    !user &&
    (request.nextUrl.pathname.startsWith('/dashboard') ||
      request.nextUrl.pathname.startsWith('/settings'))
  ) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/login'
    redirectUrl.searchParams.set('redirect', request.nextUrl.pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If logged in and visiting / or /login, bounce to /dashboard
  if (
    user &&
    (request.nextUrl.pathname === '/' || request.nextUrl.pathname === '/login')
  ) {
    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = '/dashboard'
    return NextResponse.redirect(redirectUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
