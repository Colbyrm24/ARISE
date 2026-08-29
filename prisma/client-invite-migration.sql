-- The missing first step of the funnel: an invitation for somebody who is
-- not a client yet. The coach writes the terms once, gets one link, texts
-- it, and the account -> payment -> agreement chain runs off this row.
--
-- Safe to run more than once.
create table if not exists public.client_invites (
  id                          text primary key default gen_random_uuid()::text,
  token                       text not null unique,
  coach_id                    text not null references public.users (id),
  plan_id                     text not null references public.plans (id),
  agreement_template_id       text not null references public.agreement_templates (id),
  name                        text,
  price_override              numeric(10, 2),
  number_of_payments_override integer,
  term_months_override        integer,
  start_date                  date not null,
  used_at                     timestamptz,
  used_by                     text,
  created_at                  timestamptz not null default now(),
  deleted_at                  timestamptz
);

create index if not exists client_invites_coach_id_idx on public.client_invites (coach_id);

-- Prisma writes `String @id @default(uuid())` as TEXT on Postgres unless the
-- field is marked @db.Uuid, and nothing in this schema is. So these are text
-- columns to match the tables they point at.
--
-- Verify:
--   select column_name, data_type from information_schema.columns
--   where table_name = 'client_invites' order by ordinal_position;
