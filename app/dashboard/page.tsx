import { supabaseServer } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function getSession() {
  const supabase = await supabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export default async function DashboardPage() {
  const { supabase, user } = await getSession()

  if (!user) {
    redirect('/login')
  }

  // Fetch the user's API keys (without the encrypted key values)
  const { data: apiKeys } = await supabase
    .from('api_keys')
    .select('id, provider, label, key_fingerprint, last_polled_at, last_status, created_at')
    .order('created_at', { ascending: false })

  // Fetch thresholds
  const { data: thresholds } = await supabase
    .from('thresholds')
    .select('id, scope, amount_cents, api_key_id')
    .order('created_at', { ascending: false })

  // Fetch last 7 days of spend
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const { data: spendLog } = await supabase
    .from('spend_log')
    .select('day, amount_cents, api_key_id')
    .gte('day', sevenDaysAgo.toISOString().split('T')[0])
    .order('day', { ascending: true })

  // Aggregate spend by day for the chart
  const dailySpend: Record<string, number> = {}
  for (const row of spendLog ?? []) {
    dailySpend[row.day] = (dailySpend[row.day] ?? 0) + row.amount_cents
  }
  const chartData = Object.entries(dailySpend).map(([day, cents]) => ({
    day,
    dollars: (cents / 100).toFixed(2),
  }))

  const totalThisMonth = (spendLog ?? [])
    .filter((r) => r.day.startsWith(new Date().toISOString().slice(0, 7)))
    .reduce((sum, r) => sum + r.amount_cents, 0)
  const totalDollars = (totalThisMonth / 100).toFixed(2)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <h1 className="text-lg font-semibold">Pulse</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-400">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="text-sm text-slate-400 hover:text-slate-200"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl space-y-8 px-6 py-8">
        {/* Spend summary */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <p className="text-sm text-slate-400">Spend this month</p>
          <p className="mt-1 text-4xl font-bold tracking-tight">
            ${totalDollars}
          </p>
          {chartData.length > 0 && (
            <div className="mt-6 flex items-end gap-2">
              {chartData.map((d) => {
                const max = Math.max(...chartData.map((c) => parseFloat(c.dollars)), 0.01)
                const height = Math.max(2, (parseFloat(d.dollars) / max) * 80)
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className="w-full rounded-t bg-emerald-500/80"
                      style={{ height: `${height}px` }}
                      title={`$${d.dollars}`}
                    />
                    <span className="text-[10px] text-slate-500">
                      {d.day.slice(5)}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
          {chartData.length === 0 && (
            <p className="mt-4 text-sm text-slate-500">
              No spend data yet. Add an API key to start tracking.
            </p>
          )}
        </section>

        {/* API Keys */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-medium">API Keys</h2>
            <Link
              href="/dashboard/add-key"
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              + Add key
            </Link>
          </div>

          {(apiKeys ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
              <p className="text-sm text-slate-400">
                No API keys yet. Add your OpenAI or Anthropic key to start monitoring spend.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(apiKeys ?? []).map((key) => (
                <div
                  key={key.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{key.label}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase text-slate-400">
                        {key.provider}
                      </span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-500">
                      {key.key_fingerprint}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400">
                      {key.last_polled_at
                        ? `Polled ${new Date(key.last_polled_at).toLocaleTimeString()}`
                        : 'Not polled yet'}
                    </p>
                    {key.last_status === 'ok' && (
                      <span className="text-xs text-emerald-400">● Active</span>
                    )}
                    {key.last_status === 'revoked' && (
                      <span className="text-xs text-red-400">● Revoked</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Thresholds */}
        <section className="space-y-4">
          <h2 className="text-base font-medium">Alerts</h2>
          {(thresholds ?? []).length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-8 text-center">
              <p className="text-sm text-slate-400">
                No alerts configured. Add one to get pinged when spend crosses your threshold.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {(thresholds ?? []).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-4 py-3"
                >
                  <span className="text-sm capitalize">{t.scope}</span>
                  <span className="text-sm font-mono text-emerald-400">
                    ${(t.amount_cents / 100).toFixed(0)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Plan */}
        <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Current plan</p>
              <p className="mt-1 text-lg font-medium capitalize">
                Free
              </p>
            </div>
            <Link
              href="/settings/billing"
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800"
            >
              Upgrade to Pro — $9/mo
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
