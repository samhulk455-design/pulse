'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function AddKeyPage() {
  const router = useRouter()
  const [provider, setProvider] = useState<'openai' | 'anthropic'>('openai')
  const [label, setLabel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, label, apiKey }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? 'Failed to add key')
      }
      router.push('/dashboard')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto max-w-4xl">
          <button
            onClick={() => router.back()}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-2xl font-semibold">Add API Key</h1>
        <p className="mt-2 text-sm text-slate-400">
          Your key is encrypted with pgcrypto at rest. We never display it back, never log it in plaintext.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* Provider selector */}
          <div>
            <label className="mb-2 block text-sm font-medium">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider('openai')}
                className={`rounded-lg border px-4 py-3 text-sm transition ${
                  provider === 'openai'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                OpenAI
              </button>
              <button
                type="button"
                onClick={() => setProvider('anthropic')}
                className={`rounded-lg border px-4 py-3 text-sm transition ${
                  provider === 'anthropic'
                    ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                    : 'border-slate-700 text-slate-400 hover:border-slate-600'
                }`}
              >
                Anthropic
              </button>
            </div>
          </div>

          {/* Label */}
          <div>
            <label htmlFor="label" className="mb-2 block text-sm font-medium">
              Label
            </label>
            <input
              id="label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Production, Staging, Side project"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* API Key */}
          <div>
            <label htmlFor="apiKey" className="mb-2 block text-sm font-medium">
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={provider === 'openai' ? 'sk-...' : 'sk-ant-...'}
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-mono placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-2 text-xs text-slate-500">
              {provider === 'openai'
                ? 'Find at platform.openai.com/api-keys'
                : 'Find at console.anthropic.com/settings/keys'}
            </p>
          </div>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-emerald-500 px-4 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? 'Encrypting & saving…' : 'Add key'}
          </button>
        </form>
      </main>
    </div>
  )
}
