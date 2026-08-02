import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Hero — pain-first per landing copy doc */}
      <section className="mx-auto max-w-3xl px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Your OpenAI bill just hit $400
          <br />
          <span className="text-slate-400">
            and you found out when the charge hit your card.
          </span>
        </h1>
        <p className="mt-4 text-lg text-slate-400">
          Pulse pings you on Slack the moment your spend crosses a threshold you set.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link
            href="/login"
            className="rounded-lg bg-emerald-500 px-6 py-3 text-sm font-medium text-slate-950 transition hover:bg-emerald-400"
          >
            Get a Slack alert before the bill does — Free
          </Link>
        </div>
      </section>

      {/* Pain stats — real quotes from real Reddit/HN posts */}
      <section className="mx-auto max-w-4xl px-6 py-16">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-3xl font-bold text-red-400">$5K</p>
            <p className="mt-1 text-sm text-slate-400">in one day of Claude Code</p>
            <p className="mt-2 text-xs text-slate-600">— Reddit, r/claude</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-3xl font-bold text-red-400">$50K</p>
            <p className="mt-1 text-sm text-slate-400">Azure OpenAI bill in one hour</p>
            <p className="mt-2 text-xs text-slate-600">— Reddit, r/AZURE</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-3xl font-bold text-red-400">$15K</p>
            <p className="mt-1 text-sm text-slate-400">annual API cost, one side project</p>
            <p className="mt-2 text-xs text-slate-600">— Hacker News</p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-3xl font-bold text-red-400">10×</p>
            <p className="mt-1 text-sm text-slate-400">$2/day → $20+/day, couldn't stop it</p>
            <p className="mt-2 text-xs text-slate-600">— OpenAI Community Forum</p>
          </div>
        </div>
      </section>

      {/* How it works — 3 steps per landing copy doc */}
      <section className="mx-auto max-w-2xl px-6 py-16">
        <h2 className="text-center text-2xl font-semibold">How it works</h2>
        <ol className="mt-8 space-y-6">
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">1</span>
            <p className="pt-1 text-slate-300">Paste your OpenAI or Anthropic key</p>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">2</span>
            <p className="pt-1 text-slate-300">Set your threshold — $X/day, $Y/month, or per-key</p>
          </li>
          <li className="flex gap-4">
            <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-slate-950">3</span>
            <p className="pt-1 text-slate-300">Get Slack + email the moment you cross it</p>
          </li>
        </ol>
      </section>

      {/* Pricing — 2 tiers, no 3-column table */}
      <section className="mx-auto max-w-md px-6 py-16">
        <h2 className="text-center text-2xl font-semibold">Pricing</h2>
        <div className="mt-8 space-y-4">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
            <p className="text-sm font-medium text-slate-400">Free</p>
            <p className="mt-1 text-2xl font-bold">$0</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-400">
              <li>1 API key</li>
              <li>Email alerts only</li>
              <li>30-min polling</li>
              <li>7-day history</li>
            </ul>
          </div>
          <div className="rounded-xl border border-emerald-600 bg-slate-900 p-6">
            <p className="text-sm font-medium text-emerald-400">Pro</p>
            <p className="mt-1 text-2xl font-bold">$9<span className="text-base font-normal text-slate-400">/mo</span></p>
            <ul className="mt-3 space-y-1 text-sm text-slate-300">
              <li>Unlimited keys</li>
              <li>Slack + email alerts</li>
              <li>5-min polling</li>
              <li>90-day history</li>
            </ul>
            <Link
              href="/login"
              className="mt-4 block rounded-lg bg-emerald-500 py-2 text-center text-sm font-medium text-slate-950 hover:bg-emerald-400"
            >
              Subscribe
            </Link>
          </div>
        </div>
      </section>

      {/* Footer — 4 micro-trust signals */}
      <footer className="border-t border-slate-800 px-6 py-12">
        <div className="mx-auto max-w-3xl space-y-3 text-center text-sm text-slate-500">
          <p>Why I built this: I got a $400 OpenAI bill I didn't catch for 3 days.</p>
          <p>Keys encrypted with AES-256-GCM at rest. Worker is open source.</p>
          <p>hi@pulseonit.dev — I read everything, reply within 24h.</p>
          <p className="pt-2 text-xs">© 2026 Pulse</p>
        </div>
      </footer>
    </div>
  )
}
