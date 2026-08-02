import { Resend } from 'resend'

/**
 * Fires an alert when a threshold is crossed.
 * Channels: email (Resend) and Slack (incoming webhook).
 *
 * Dedup is handled at the DB level via the unique constraint:
 * (threshold_id, channel, date_trunc('day', sent_at))
 * — one ping per channel per day. Caller handles the INSERT IGNORE.
 */

export interface AlertPayload {
  userEmail: string
  provider: 'openai' | 'anthropic'
  keyLabel: string
  scope: 'daily' | 'monthly' | 'per_key_monthly'
  thresholdDollars: number
  currentDollars: number
}

export async function fireEmailAlert(payload: AlertPayload): Promise<boolean> {
  const resendKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.ALERT_FROM_EMAIL ?? 'Pulse <alerts@pulseonit.dev>'

  if (!resendKey) {
    console.error('[alerts] RESEND_API_KEY not set, skipping email alert')
    return false
  }

  const resend = new Resend(resendKey)

  const { error } = await resend.emails.send({
    from: fromEmail,
    to: payload.userEmail,
    subject: `⚠️ Pulse Alert: ${payload.provider} spend crossed $${payload.thresholdDollars}`,
    text: [
      `Pulse Alert`,
      ``,
      `Your ${payload.provider} API spend has crossed your ${payload.scope} threshold.`,
      ``,
      `  Key:       ${payload.keyLabel}`,
      `  Threshold: $${payload.thresholdDollars}`,
      `  Current:   $${payload.currentDollars}`,
      ``,
      `Review your spend: ${process.env.NEXT_PUBLIC_APP_URL ?? 'https://pulseonit.dev'}/dashboard`,
      ``,
      `— Pulse`,
    ].join('\n'),
  })

  if (error) {
    console.error('[alerts] Resend error:', error.message)
    return false
  }
  return true
}

export async function fireSlackAlert(opts: {
  webhookUrl: string
  payload: AlertPayload
}): Promise<boolean> {
  const { webhookUrl, payload } = opts

  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    console.error('[alerts] Invalid Slack webhook URL')
    return false
  }

  const message = {
    text: `⚠️ *Pulse Alert*`,
    attachments: [
      {
        color: 'danger',
        fields: [
          { title: 'Provider', value: payload.provider, short: true },
          { title: 'Key', value: payload.keyLabel, short: true },
          { title: 'Threshold', value: `$${payload.thresholdDollars}`, short: true },
          { title: 'Current Spend', value: `$${payload.currentDollars}`, short: true },
          { title: 'Scope', value: payload.scope, short: true },
        ],
        footer: 'Pulse — apibill alerts',
        footer_icon: 'https://pulseonit.dev/icon.png',
      },
    ],
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(8000),
    })
    return res.ok
  } catch (err) {
    console.error('[alerts] Slack webhook error:', err)
    return false
  }
}
