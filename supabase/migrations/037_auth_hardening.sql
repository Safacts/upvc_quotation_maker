-- Phase 2 auth hardening companion migration.
-- The application currently keeps short-lived rate-limit buckets in-process;
-- this table is reserved for durable lockout counters when a shared limiter is
-- enabled in the deployment topology. No live database is touched by this task.
create table if not exists public.auth_rate_limits (
  subject text not null,
  scope text not null,
  failure_count integer not null default 0,
  window_started_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (scope, subject)
);

alter table public.auth_rate_limits enable row level security;
revoke all on public.auth_rate_limits from anon, authenticated;
