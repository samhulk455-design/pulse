import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser-safe Supabase client. Use this in Client Components only.
 * For Server Components / Route Handlers / Server Actions use `supabaseServer()`.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
