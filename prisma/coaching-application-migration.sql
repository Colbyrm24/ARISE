-- Coaching applications from the public /coaching page.
--
-- Run once in the Supabase SQL editor. Safe to run twice: every statement is
-- guarded. Additive only — one new table, nothing existing is touched.
--
-- Run BEFORE the code from this branch is deployed: the coach console's
-- badge count reads this table on every /coach screen (it falls back to zero
-- if the table is missing, but the apply form cannot save until it exists).

create table if not exists coaching_applications (
  id           text primary key default gen_random_uuid()::text,
  first_name   text not null,
  email        text not null,
  phone        text,
  instagram    text,
  age_range    text not null,
  goal         text not null,
  obstacle     text not null,
  experience   text not null,
  start_when   text not null,
  invest_ready text not null,
  source       text,
  status       text not null default 'new',
  status_at    timestamptz,
  created_at   timestamptz not null default now()
);

-- The duplicate check reads "this email, recently".
create index if not exists coaching_applications_email_created_at_idx
  on coaching_applications (email, created_at);
-- The console's list and its badge read "by status, newest first".
create index if not exists coaching_applications_status_created_at_idx
  on coaching_applications (status, created_at);

-- Every table in this project has RLS on; the app reads through Prisma with
-- the service role, so no policies are needed. With RLS on and no policy, the
-- public anon key can neither read nor write applicants' details.
alter table coaching_applications enable row level security;
