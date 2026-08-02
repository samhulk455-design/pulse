-- Pulse DB schema — Supabase Postgres
-- Run in Supabase SQL editor on Day 9
-- All keys encrypted at rest via pgcrypto before write (see lib/crypto.ts)

create extension if not exists pgcrypto;

-- Tracks user state. Supabase auth.users is the source of truth for identity;
-- this table holds the subscription status for our app logic.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free','pro')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  slack_webhook_url text,                -- nullable; Pro-only feature
  trial_ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- RLS policy for slack_webhook_url (same as plan — only owner can read/write).


-- User-added API keys. The actual key value is encrypted client-side with
-- pgcrypto symmetric_encrypt using a key from Supabase Vault — never logged,
-- never returned by any API route.
create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic')),
  label text not null,
  encrypted_key text not null,            -- pgcrypto encrypt() output, armored
  key_fingerprint text not null,          -- first 8 chars of sha256, for display "sk-...abcd"
  last_polled_at timestamptz,
  last_status text check (last_status in ('ok','revoked','rate_limited')),
  created_at timestamptz not null default now()
);
create index on public.api_keys(user_id);

-- Thresholds the user sets on each key (or globally per user).
create table if not exists public.thresholds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  api_key_id uuid references public.api_keys(id) on delete cascade, -- null = user-wide
  scope text not null check (scope in ('daily','monthly','per_key_monthly')),
  amount_cents integer not null,          -- $1 = 100, never store floats for money
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.thresholds(user_id);

-- One row per polling tick. Cheap append-only log, rotatable.
-- This is what powers the 7-day bar chart.
create table if not exists public.spend_log (
  id bigserial primary key,
  api_key_id uuid not null references public.api_keys(id) on delete cascade,
  day date not null,
  amount_cents integer not null,
  source text not null default 'poll',
  fetched_at timestamptz not null default now()
);
create index on public.spend_log(api_key_id, day desc);

-- Alert delivery history. Dedupe via (threshold_id, day) so we don't ping twice.
create table if not exists public.alerts_log (
  id bigserial primary key,
  threshold_id uuid not null references public.thresholds(id) on delete cascade,
  channel text not null check (channel in ('email','slack','sms')),
  amount_cents integer not null,
  sent_at timestamptz not null default now(),
  unique (threshold_id, channel, date_trunc('day', sent_at)) -- one ping per channel per day
);

-- Row-level security: users see only their own rows.
alter table public.profiles enable row level security;
alter table public.api_keys enable row level security;
alter table public.thresholds enable row level security;
alter table public.spend_log enable row level security;
alter table public.alerts_log enable row level security;

create policy "own profile" on public.profiles
  for select using (auth.uid() = user_id);
create policy "update own profile" on public.profiles
  for update using (auth.uid() = user_id);

create policy "own keys" on public.api_keys
  for all using (auth.uid() = user_id);

create policy "own thresholds" on public.thresholds
  for all using (auth.uid() = user_id);

create policy "own spend" on public.spend_log
  for select using (
    exists (select 1 from public.api_keys k
            where k.id = api_key_id and k.user_id = auth.uid())
  );

-- alerts_log is write-only from the worker (service_role), users just see
-- their own for the history view.
create policy "own alerts" on public.alerts_log
  for select using (
    exists (select 1 from public.thresholds t
            where t.id = threshold_id and t.user_id = auth.uid())
  );
