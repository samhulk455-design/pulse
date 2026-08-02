import { NextRequest, NextResponse } from 'next/server'
import { supabaseServer } from '@/lib/supabase-server'
import { fireSlackAlert } from '@/lib/alerts'

/**
 * GET /api/settings
 * Returns the user's current profile (plan, slack_webhook_url).
 */
export async function GET() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('plan, slack_webhook_url')
    .eq('user_id', user.id)
    .single()

  if (error) {
    // Profile row may not exist yet — return defaults
    return NextResponse.json({
      plan: 'free',
      slack_webhook_url: null,
    })
  }

  return NextResponse.json(profile)
}

/**
 * PATCH /api/settings
 * Body: { slack_webhook_url?: string | null }
 *
 * Saves the Slack webhook URL. Pro-only — returns 403 if user is on free plan.
 * Passing null clears the webhook.
 */
export async function PATCH(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check plan
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('user_id', user.id)
    .single()

  const plan = profile?.plan ?? 'free'

  const body = await request.json()
  const { slack_webhook_url } = body as { slack_webhook_url?: string | null }

  // Pro gate
  if (plan !== 'pro') {
    return NextResponse.json(
      { error: 'Slack alerts are a Pro feature. Upgrade to enable Slack notifications.' },
      { status: 403 }
    )
  }

  // Validate URL format
  let urlToSave: string | null = null
  if (slack_webhook_url && slack_webhook_url !== '') {
    try {
      const parsed = new URL(slack_webhook_url)
      if (parsed.hostname !== 'hooks.slack.com') {
        return NextResponse.json(
          { error: 'Webhook URL must be from hooks.slack.com' },
          { status: 400 }
        )
      }
      urlToSave = slack_webhook_url
    } catch {
      return NextResponse.json(
        { error: 'Invalid webhook URL' },
        { status: 400 }
      )
    }
  }

  // Upsert the profile row (may not exist yet if user hasn't hit a place that creates it)
  let error = null
  if (profile) {
    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ slack_webhook_url: urlToSave })
      .eq('user_id', user.id)
    error = updateErr
  } else {
    const { error: insertErr } = await supabase
      .from('profiles')
      .insert({ user_id: user.id, slack_webhook_url: urlToSave })
    error = insertErr
  }

  if (error) {
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, slack_webhook_url: urlToSave })
}

/**
 * POST /api/settings/slack-test
 *
 * Sends a test alert to the user's configured Slack webhook.
 * Lets users verify their webhook works without needing a real threshold breach.
 */
export async function POST(request: NextRequest) {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, slack_webhook_url')
    .eq('user_id', user.id)
    .single()

  if (profile?.plan !== 'pro') {
    return NextResponse.json(
      { error: 'Slack test is a Pro feature' },
      { status: 403 }
    )
  }

  if (!profile?.slack_webhook_url) {
    return NextResponse.json(
      { error: 'No Slack webhook configured. Save your webhook URL first.' },
      { status: 400 }
    )
  }

  const sent = await fireSlackAlert({
    webhookUrl: profile.slack_webhook_url,
    payload: {
      userEmail: user.email ?? '',
      provider: 'openai',
      keyLabel: 'Test alert',
      scope: 'monthly',
      thresholdDollars: 50,
      currentDollars: 50,
    },
  })

  if (!sent) {
    return NextResponse.json(
      { error: 'Failed to send test alert. Check your webhook URL.' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, message: 'Test alert sent to Slack' })
}
