'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SettingsPage() {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [savedUrl, setSavedUrl] = useState<string | null>(null)
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data) => {
        setPlan(data.plan ?? 'free')
        setSavedUrl(data.slack_webhook_url ?? null)
        setWebhookUrl(data.slack_webhook_url ?? '')
      })
      .catch(() => setMessage({ type: 'error', text: 'Failed to load settings' }))
  }, [])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_webhook_url: webhookUrl || null }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save')
      }

      setSavedUrl(webhookUrl || null)
      setMessage({ type: 'success', text: 'Slack webhook saved.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings', { method: 'POST' })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error ?? 'Test failed')
      }

      setMessage({ type: 'success', text: '✅ Test alert sent to your Slack channel.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Test failed',
      })
    } finally {
      setTesting(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setMessage(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slack_webhook_url: null }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to clear')
      }

      setWebhookUrl('')
      setSavedUrl(null)
      setMessage({ type: 'success', text: 'Slack webhook cleared.' })
    } catch (err) {
      setMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Something went wrong',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-200">
            ← Dashboard
          </Link>
          <h1 className="text-lg font-semibold">Settings</h1>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        {/* Slack webhook section */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium">Slack alerts</h2>
            <p className="mt-1 text-sm text-slate-400">
              Get a Slack notification when your API spend crosses a threshold.
              Pro plan only.
            </p>
          </div>

          {plan === 'free' ? (
            <div className="rounded-xl border border-amber-700/50 bg-amber-900/20 p-6">
              <p className="text-sm text-amber-300">
                Slack alerts are a Pro feature.
              </p>
              <Link
                href="/settings/billing"
                className="mt-3 inline-block rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-amber-400"
              >
                Upgrade to Pro — $9/mo
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Setup guide */}
              <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
                <h3 className="text-sm font-medium text-slate-300">
                  How to create a Slack webhook
                </h3>
                <ol className="mt-2 space-y-1 text-xs text-slate-400">
                  <li>1. Go to <a href="https://api.slack.com/apps" target="_blank" rel="noopener noreferrer" className="text-emerald-400 hover:underline">api.slack.com/apps</a> → Create New App</li>
                  <li>2. Name it "Pulse" → select your workspace</li>
                  <li>3. Left sidebar → Incoming Webhooks → toggle ON</li>
                  <li>4. Click "Add New Webhook to Workspace" → pick a channel</li>
                  <li>5. Copy the webhook URL (starts with <code className="text-slate-300">https://hooks.slack.com/services/...</code>)</li>
                  <li>6. Paste it below</li>
                </ol>
              </div>

              {/* Webhook form */}
              <form onSubmit={handleSave} className="space-y-4">
                <div>
                  <label htmlFor="webhook" className="mb-2 block text-sm font-medium">
                    Slack webhook URL
                  </label>
                  <input
                    id="webhook"
                    type="url"
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.slack.com/services/your-team/your-bot/your-token"
                    className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-mono placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                {message && (
                  <p className={`text-sm ${message.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {message.text}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {saving ? 'Saving…' : 'Save webhook'}
                  </button>

                  {savedUrl && (
                    <button
                      type="button"
                      onClick={handleTest}
                      disabled={testing}
                      className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium transition hover:bg-slate-800 disabled:opacity-50"
                    >
                      {testing ? 'Sending test…' : 'Send test alert'}
                    </button>
                  )}

                  {savedUrl && (
                    <button
                      type="button"
                      onClick={handleClear}
                      disabled={saving}
                      className="rounded-lg px-4 py-2 text-sm text-slate-400 transition hover:text-red-400 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </section>

        {/* Danger zone — delete account (placeholder for now) */}
        <section className="space-y-4">
          <h2 className="text-base font-medium">Account</h2>
          <p className="text-sm text-slate-400">
            Need to delete your account and all associated data?{' '}
            <a href="mailto:hi@pulseonit.dev" className="text-emerald-400 hover:underline">
              Email us
            </a>{' '}
            and we'll wipe everything within 24 hours.
          </p>
        </section>
      </main>
    </div>
  )
}
