import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { encrypt, fingerprint } from '@/lib/crypto'

/**
 * POST /api/keys
 * Body: { provider: 'openai' | 'anthropic', label: string, apiKey: string }
 *
 * Encrypts the API key with pgcrypto symmetric encryption and stores it.
 * Never returns the encrypted key back.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { provider, label, apiKey } = body as {
    provider: 'openai' | 'anthropic'
    label: string
    apiKey: string
  }

  // Basic validation
  if (!provider || !['openai', 'anthropic'].includes(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }
  if (!label || label.length > 100) {
    return NextResponse.json({ error: 'Label required (max 100 chars)' }, { status: 400 })
  }
  if (!apiKey || apiKey.length < 20) {
    return NextResponse.json({ error: 'API key looks too short' }, { status: 400 })
  }

  // Validate the key against the provider before storing — fail fast
  const valid = await validateKey(provider, apiKey)
  if (!valid) {
    return NextResponse.json(
      { error: `This key was rejected by ${provider}. Check it has the right permissions.` },
      { status: 400 }
    )
  }

  // Encrypt and store
  const encryptedKey = await encrypt(apiKey)
  const fp = fingerprint(apiKey)

  const { error } = await supabase.from('api_keys').insert({
    user_id: user.id,
    provider,
    label,
    encrypted_key: encryptedKey,
    key_fingerprint: fp,
  })

  if (error) {
    return NextResponse.json({ error: 'Failed to save key' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Validates an API key by making an authorized request to the provider.
 * Returns true if the key is accepted, false otherwise.
 */
async function validateKey(provider: 'openai' | 'anthropic', apiKey: string): Promise<boolean> {
  try {
    if (provider === 'openai') {
      // Hit a lightweight endpoint with auth; 200 = valid key
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    } else {
      // Anthropic — hit a lightweight endpoint with the required headers
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(5000),
      })
      return res.ok
    }
  } catch {
    return false
  }
}

/**
 * DELETE /api/keys?id=<uuid>
 * Removes an API key and all its associated thresholds + spend logs.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = request.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Missing key id' }, { status: 400 })
  }

  const { error } = await supabase
    .from('api_keys')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)  // RLS doubles down, but be explicit

  if (error) {
    return NextResponse.json({ error: 'Failed to delete key' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
