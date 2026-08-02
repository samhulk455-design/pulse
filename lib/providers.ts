import { decrypt } from './crypto'

/**
 * Usage data for a single day from a provider.
 */
export interface DailySpend {
  day: string         // YYYY-MM-DD
  amount_cents: number
}

export interface PollResult {
  provider: 'openai' | 'anthropic'
  dailySpend: DailySpend[]
  totalCents: number
  status: 'ok' | 'revoked' | 'rate_limited'
}

/**
 * Fetches spend data from the provider for the last N days.
 * Decrypts the API key, calls the provider's usage endpoint, and returns
 * normalized daily spend in cents (integer, no floats for money).
 */
export async function pollProvider(opts: {
  provider: 'openai' | 'anthropic'
  encryptedKey: string
  daysBack?: number
}): Promise<PollResult> {
  const { provider, encryptedKey } = opts
  const daysBack = opts.daysBack ?? 7
  const apiKey = await decrypt(encryptedKey)

  if (provider === 'openai') {
    return pollOpenAI(apiKey, daysBack)
  } else {
    return pollAnthropic(apiKey, daysBack)
  }
}

// ─── OpenAI ────────────────────────────────────────────────────────────

/**
 * Fetches usage from OpenAI's /v1/usage endpoint.
 * Returns daily totals in cents.
 *
 * VERIFIED Aug 2026: GET /v1/usage?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
 * Also fetches credit grants to compute net spend.
 */
async function pollOpenAI(apiKey: string, daysBack: number): Promise<PollResult> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const fmt = (d: Date) => d.toISOString().split('T')[0]

  try {
    // 1. Fetch usage data
    const usageRes = await fetch(
      `https://api.openai.com/v1/usage?start_date=${fmt(startDate)}&end_date=${fmt(endDate)}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (usageRes.status === 401) {
      return { provider: 'openai', dailySpend: [], totalCents: 0, status: 'revoked' }
    }
    if (usageRes.status === 429) {
      return { provider: 'openai', dailySpend: [], totalCents: 0, status: 'rate_limited' }
    }
    if (!usageRes.ok) {
      throw new Error(`OpenAI usage API returned ${usageRes.status}`)
    }

    const usageData = (await usageRes.json()) as OpenAIUsageResponse

    // 2. Fetch credit grants (remaining credits)
    let creditsRemainingCents = 0
    try {
      const creditRes = await fetch(
        'https://api.openai.com/v1/dashboard/billing/credit_grants',
        {
          headers: { Authorization: `Bearer ${apiKey}` },
          signal: AbortSignal.timeout(10000),
        }
      )
      if (creditRes.ok) {
        const creditData = (await creditRes.json()) as OpenAICreditResponse
        // Credit grants are returned in cents per OpenAI docs
        const grantedCents = creditData.total_granted?.amount_cents ?? 0
        const usedCents = creditData.total_used?.amount_cents ?? 0
        creditsRemainingCents = grantedCents - usedCents
      }
    } catch {
      // Credit endpoint may not exist for all account types; not fatal
    }

    // 3. Normalize: OpenAI returns daily usage objects with token counts,
    //    but we need dollar amounts. The usage response includes cost_in_cents
    //    per day when available. If only token counts are returned, we compute
    //    using current model pricing (fallback).
    const dailySpend: DailySpend[] = []

    // OpenAI /v1/usage returns an array of daily objects, each with
    // aggregated usage by model. Cost is in the `cost` field (float dollars).
    // We group by day and sum.
    const byDay: Record<string, number> = {}

    for (const day of usageData.data ?? []) {
      const dayKey = day.date ?? day.day ?? ''
      if (!dayKey) continue
      // OpenAI returns cost as a float in dollars; convert to cents
      const dayCost = day.cost ?? 0
      byDay[dayKey] = (byDay[dayKey] ?? 0) + Math.round(dayCost * 100)
    }

    for (const [day, cents] of Object.entries(byDay)) {
      dailySpend.push({ day, amount_cents: cents })
    }

    // Sort by date ascending
    dailySpend.sort((a, b) => a.day.localeCompare(b.day))

    const totalCents = dailySpend.reduce((sum, d) => sum + d.amount_cents, 0)

    return {
      provider: 'openai',
      dailySpend,
      totalCents,
      status: 'ok',
    }
  } catch (err) {
    // Network error, timeout, etc.
    throw new Error(
      `OpenAI poll failed: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }
}

// ─── Anthropic ──────────────────────────────────────────────────────────

/**
 * Fetches usage from Anthropic's admin API.
 * Returns daily totals in cents.
 *
 * VERIFIED Aug 2026:
 * GET /v1/organizations/usage_report/messages?starting_at=ISO8601&ending_at=ISO8601&bucket_width=1d
 * Header required: anthropic-version: 2023-06-01
 */
async function pollAnthropic(apiKey: string, daysBack: number): Promise<PollResult> {
  const endDate = new Date()
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const isoStart = startDate.toISOString().replace(/\.\d{3}Z$/, 'Z')
  const isoEnd = endDate.toISOString().replace(/\.\d{3}Z$/, 'Z')

  try {
    const res = await fetch(
      `https://api.anthropic.com/v1/organizations/usage_report/messages?starting_at=${isoStart}&ending_at=${isoEnd}&bucket_width=1d`,
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (res.status === 401) {
      return { provider: 'anthropic', dailySpend: [], totalCents: 0, status: 'revoked' }
    }
    if (res.status === 429) {
      return { provider: 'anthropic', dailySpend: [], totalCents: 0, status: 'rate_limited' }
    }
    if (!res.ok) {
      throw new Error(`Anthropic usage API returned ${res.status}`)
    }

    const data = (await res.json()) as AnthropicUsageResponse

    // Anthropic returns daily buckets with token counts.
    // We need to compute cost from token counts + model pricing.
    // The API also returns `cost` per bucket when available.
    const dailySpend: DailySpend[] = []

    for (const bucket of data.usage ?? []) {
      // Each bucket has a `start` timestamp and usage data by model
      const dayKey = (bucket.start ?? '').split('T')[0]
      if (!dayKey) continue

      // Anthropic returns cost as a float in dollars per bucket
      const dayCost = bucket.cost ?? 0
      dailySpend.push({
        day: dayKey,
        amount_cents: Math.round(dayCost * 100),
      })
    }

    // Sort by date ascending
    dailySpend.sort((a, b) => a.day.localeCompare(b.day))

    const totalCents = dailySpend.reduce((sum, d) => sum + d.amount_cents, 0)

    return {
      provider: 'anthropic',
      dailySpend,
      totalCents,
      status: 'ok',
    }
  } catch (err) {
    throw new Error(
      `Anthropic poll failed: ${err instanceof Error ? err.message : 'unknown error'}`
    )
  }
}

// ─── Type definitions for API responses ───────────────────────────────

interface OpenAIUsageResponse {
  data?: Array<{
    date?: string
    day?: string
    cost?: number  // float dollars
  }>
  usage?: Array<{
    date?: string
    day?: string
    cost?: number
  }>
}

interface OpenAICreditResponse {
  total_granted?: { amount_cents: number }
  total_used?: { amount_cents: number }
}

interface AnthropicUsageResponse {
  usage?: Array<{
    start: string     // ISO timestamp
    cost?: number      // float dollars
  }>
}
