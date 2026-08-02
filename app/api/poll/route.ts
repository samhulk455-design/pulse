import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-server'
import { pollProvider } from '@/lib/providers'
import { fireEmailAlert, fireSlackAlert } from '@/lib/alerts'

/**
 * POST /api/poll
 *
 * Called by QStash cron every 5 minutes (Pro) or 30 minutes (Free).
 * Uses the service-role client to access all users' keys (bypasses RLS).
 *
 * Flow:
 * 1. Fetch all active API keys (service role)
 * 2. For each key, poll the provider for usage data
 * 3. Upsert daily spend into spend_log
 * 4. Check each user's thresholds; fire alerts if crossed
 * 5. Update key's last_polled_at + last_status
 *
 * Auth: this route is ONLY callable by QStash (via shared secret in header).
 * It must NOT be publicly accessible without the secret.
 */
export async function POST(request: NextRequest) {
  // ── Auth: verify QStash secret ────────────────────────────────────────
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.QSTASH_TOKEN

  if (!expectedSecret) {
    console.error('[poll] QSTASH_TOKEN not set — refusing to run')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 1. Fetch all active API keys ──────────────────────────────────────
  const admin = supabaseAdmin()

  const { data: keys, error: keysErr } = await admin
    .from('api_keys')
    .select('id, user_id, provider, label, encrypted_key, last_polled_at')
    .order('created_at', { ascending: true })
    .limit(100)  // Cap per poll cycle — scale later

  if (keysErr) {
    console.error('[poll] Failed to fetch keys:', keysErr.message)
    return NextResponse.json({ error: 'DB error' }, { status: 500 })
  }

  if (!keys || keys.length === 0) {
    return NextResponse.json({ ok: true, polled: 0, message: 'No keys to poll' })
  }

  // ── 2-3. Poll each key + upsert spend ─────────────────────────────────
  let polled = 0
  let errors = 0
  let alertsFired = 0

  for (const key of keys) {
    try {
      const result = await pollProvider({
        provider: key.provider,
        encryptedKey: key.encrypted_key,
        daysBack: 7,
      })

      // Update key status
      await admin
        .from('api_keys')
        .update({
          last_polled_at: new Date().toISOString(),
          last_status: result.status,
        })
        .eq('id', key.id)

      if (result.status !== 'ok') {
        console.warn(`[poll] Key ${key.id} (${key.provider}) status: ${result.status}`)
        errors++
        continue
      }

      // Upsert daily spend into spend_log
      for (const day of result.dailySpend) {
        // Check if we already have a log for this key+day+source
        const { data: existing } = await admin
          .from('spend_log')
          .select('id, amount_cents')
          .eq('api_key_id', key.id)
          .eq('day', day.day)
          .eq('source', 'poll')
          .limit(1)

        if (existing && existing.length > 0) {
          // Update if the amount changed (provider may report updated totals)
          if (existing[0].amount_cents !== day.amount_cents) {
            await admin
              .from('spend_log')
              .update({ amount_cents: day.amount_cents })
              .eq('id', existing[0].id)
          }
        } else {
          // Insert new log
          await admin.from('spend_log').insert({
            api_key_id: key.id,
            day: day.day,
            amount_cents: day.amount_cents,
            source: 'poll',
          })
        }
      }

      polled++

      // ── 4. Check thresholds + fire alerts ──────────────────────────────
      alertsFired += await checkThresholds(admin, key, result)

    } catch (err) {
      console.error(`[poll] Error polling key ${key.id}:`, err)
      errors++
    }
  }

  // ── 5. Summary response ───────────────────────────────────────────────
  return NextResponse.json({
    ok: true,
    polled,
    errors,
    alerts_fired: alertsFired,
    timestamp: new Date().toISOString(),
  })
}

// ─── Threshold checking ──────────────────────────────────────────────

async function checkThresholds(
  admin: ReturnType<typeof supabaseAdmin>,
  key: { id: string; user_id: string; provider: string; label: string },
  pollResult: { totalCents: number; dailySpend: Array<{ day: string; amount_cents: number }> }
): Promise<number> {
  let alertsFired = 0

  // Fetch all thresholds for this user (includes user-wide + per-key)
  const { data: thresholds } = await admin
    .from('thresholds')
    .select('id, scope, amount_cents, api_key_id, last_fired_at')
    .or(`user_id.eq.${key.user_id}`)

  if (!thresholds || thresholds.length === 0) return 0

  // Fetch user info for alerts
  const { data: userData } = await admin
    .from('profiles')
    .select('plan')
    .eq('user_id', key.user_id)
    .single()

  const plan = userData?.plan ?? 'free'

  for (const t of thresholds) {
    // Skip thresholds that apply to a DIFFERENT key
    if (t.api_key_id && t.api_key_id !== key.id) continue

    const thresholdDollars = t.amount_cents / 100
    let currentSpendCents = 0

    if (t.scope === 'daily') {
      // Sum today's spend across all this user's keys
      const today = new Date().toISOString().split('T')[0]
      const todaySpend = pollResult.dailySpend.find(
        (d) => d.day === today
      )
      currentSpendCents = todaySpend?.amount_cents ?? 0
    } else if (t.scope === 'monthly' || t.scope === 'per_key_monthly') {
      // Sum month-to-date spend
      const monthPrefix = new Date().toISOString().slice(0, 7)
      if (t.scope === 'monthly') {
        // Sum across all keys (this pollResult only covers one key,
        // so we query the DB for the full month)
        const { data: monthSpendAll } = await admin
          .from('spend_log')
          .select('amount_cents')
          .gte('day', `${monthPrefix}-01`)

        currentSpendCents = (monthSpendAll ?? []).reduce(
          (sum: number, r: { amount_cents: number }) => sum + r.amount_cents, 0
        )
      } else {
        // per_key_monthly: only this key
        currentSpendCents = pollResult.dailySpend
          .filter((d) => d.day.startsWith(monthPrefix))
          .reduce((sum, d) => sum + d.amount_cents, 0)
      }
    }

    const currentDollars = currentSpendCents / 100

    // Only fire if we've crossed the threshold AND haven't already alerted today
    if (currentSpendCents < t.amount_cents) continue
    if (t.last_fired_at && wasToday(t.last_fired_at)) continue

    // Build alert payload
    const payload = {
      userEmail: key.user_id,  // We need the actual email — fetch from auth
      provider: key.provider as 'openai' | 'anthropic',
      keyLabel: key.label,
      scope: t.scope as 'daily' | 'monthly' | 'per_key_monthly',
      thresholdDollars,
      currentDollars,
    }

    // Fetch user's email from auth.users (service role has access)
    const { data: authUser } = await admin.auth.admin.getUserById(key.user_id)
    if (authUser?.user?.email) {
      payload.userEmail = authUser.user.email
    }

    // Fire email alert (free + pro)
    const emailSent = await fireEmailAlert(payload)
    if (emailSent) {
      alertsFired++
    }

    // Fire Slack alert (pro only)
    if (plan === 'pro') {
      // Fetch user's Slack webhook URL from settings (future: settings table)
      // For now, we store it in the thresholds row as a JSON field
      // TODO: add slack_webhook_url column to profiles or a settings table
      const slackUrl = '' // placeholder until we wire Slack settings UI
      if (slackUrl) {
        await fireSlackAlert({ webhookUrl: slackUrl, payload })
        alertsFired++
      }
    }

    // Update last_fired_at so we don't spam
    await admin
      .from('thresholds')
      .update({ last_fired_at: new Date().toISOString() })
      .eq('id', t.id)
  }

  return alertsFired
}

/**
 * Returns true if the given ISO timestamp is on the same calendar day as today.
 */
function wasToday(isoTimestamp: string): boolean {
  const today = new Date().toISOString().split('T')[0]
  const that = new Date(isoTimestamp).toISOString().split('T')[0]
  return today === that
}
