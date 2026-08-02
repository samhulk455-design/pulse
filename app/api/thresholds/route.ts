import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'

/**
 * POST /api/thresholds
 * Body: {
 *   scope: 'daily' | 'monthly' | 'per_key_monthly',
 *   amount_cents: number,           // $1 = 100
 *   api_key_id?: string,            // optional: null = user-wide
 * }
 *
 * Creates a threshold for the authenticated user.
 * Free plan: max 1 threshold. Pro: unlimited.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Fetch user plan + existing threshold count
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('user_id', user.id)
    .single()

  const plan = profile?.plan ?? 'free'

  const { count: existingCount } = await supabase
    .from('thresholds')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  // Free plan limit: 1 threshold
  if (plan === 'free' && (existingCount ?? 0) >= 1) {
    return NextResponse.json(
      { error: 'Free plan allows 1 threshold. Upgrade to Pro for unlimited alerts.' },
      { status: 403 }
    )
  }

  const body = await request.json()
  const { scope, amount_cents, api_key_id } = body as {
    scope: 'daily' | 'monthly' | 'per_key_monthly'
    amount_cents: number
    api_key_id?: string
  }

  // Validation
  if (!scope || !['daily', 'monthly', 'per_key_monthly'].includes(scope)) {
    return NextResponse.json({ error: 'Invalid scope' }, { status: 400 })
  }
  if (!amount_cents || amount_cents < 100) {
    return NextResponse.json({ error: 'Amount must be at least $1 (100 cents)' }, { status: 400 })
  }
  if (amount_cents > 10_000_000) {
    return NextResponse.json({ error: 'Amount too large' }, { status: 400 })
  }

  // If api_key_id provided, verify it belongs to this user
  if (api_key_id) {
    const { data: key } = await supabase
      .from('api_keys')
      .select('id')
      .eq('id', api_key_id)
      .eq('user_id', user.id)
      .single()

    if (!key) {
      return NextResponse.json({ error: 'API key not found' }, { status: 404 })
    }
  }

  const { error } = await supabase.from('thresholds').insert({
    user_id: user.id,
    api_key_id: api_key_id ?? null,
    scope,
    amount_cents,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to create threshold' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/thresholds?id=<uuid>
 * Removes a threshold. RLS ensures ownership.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing threshold id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('thresholds')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ error: 'Failed to delete threshold' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * GET /api/thresholds
 * Returns all thresholds for the authenticated user.
 */
export async function GET(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('thresholds')
    .select('id, scope, amount_cents, api_key_id, last_fired_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch thresholds' }, { status: 500 })
  }

  return NextResponse.json({ thresholds: data })
}
