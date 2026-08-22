-- Health sync tokens.
--
-- Additive only. Missed out of schedule-migration.sql, which created
-- coach_availability and bookings but not this — caught by counting the
-- tables afterwards rather than by anything failing, which is the argument
-- for counting them.

create table if not exists public.health_tokens (
  id           text primary key default gen_random_uuid()::text,
  -- One live token per client. Reissuing replaces it, which is also how
  -- somebody on a new phone gets going and how a leaked one is revoked.
  client_id    text not null unique references public.users(id) on delete cascade,
  -- Only the hash. The plaintext is shown once at creation and never stored,
  -- so a lost token is reissued rather than recovered.
  token_hash   text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- Read and written only through the service-role client on the server. The
-- anon key never touches this table, so a leaked row cannot be turned back
-- into a working token.
alter table public.health_tokens enable row level security;
