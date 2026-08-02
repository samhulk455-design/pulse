'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ApiKey {
  id: string
  provider: string
  label: string
}

export default function AddThresholdForm({ apiKeys }: { apiKeys: ApiKey[] }) {
  const router = useRouter()
  const [scope, setScope] = useState<'daily' | 'monthly' | 'per_key_monthly'>('monthly')
  const [amount, setAmount] = useState('')
  const [apiKeyId, setApiKeyId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const amountCents = Math.round(parseFloat(amount) * 100)
    if (!amountCents || amountCents < 100) {
      setError('Amount must be at least $1')
      setSubmitting(false)
      return
    }

    try {
      const res = await fetch('/api/thresholds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scope,
          amount_cents: amountCents,
          api_key_id: apiKeyId || undefined,
        }),
      })

      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to create alert')
      }

      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Scope */}
      <div>
        <label className="mb-2 block text-sm font-medium">Alert type</label>
        <div className="grid grid-cols-3 gap-2">
          {([
            ['daily', 'Daily', 'Alert when daily spend crosses'],
            ['monthly', 'Monthly', 'Alert when month-to-date crosses'],
            ['per_key_monthly', 'Per key', 'Alert when one key crosses'],
          ] as const).map(([value, label, title]) => (
            <button
              key={value}
              type="button"
              title={title}
              onClick={() => setScope(value)}
              className={`rounded-lg border px-3 py-2 text-sm transition ${
                scope === value
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Amount */}
      <div>
        <label htmlFor="amount" className="mb-2 block text-sm font-medium">
          Threshold amount ($)
        </label>
        <input
          id="amount"
          type="number"
          step="1"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 50"
          required
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
        />
      </div>

      {/* Per-key selection */}
      {scope === 'per_key_monthly' && (
        <div>
          <label htmlFor="apiKeyId" className="mb-2 block text-sm font-medium">
            Which key?
          </label>
          <select
            id="apiKeyId"
            value={apiKeyId}
            onChange={(e) => setApiKeyId(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none"
          >
            <option value="">Select a key…</option>
            {apiKeys.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label} ({k.provider})
              </option>
            ))}
          </select>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
      >
        {submitting ? 'Creating…' : 'Create alert'}
      </button>
    </form>
  )
}
