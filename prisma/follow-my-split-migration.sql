-- Follow My Split: the low-ticket subscription.
--
-- Run once in the Supabase SQL editor. Safe to run twice: every statement is
-- guarded. Nothing here touches an existing row's data — existing clients all
-- become tier 'coaching', which is what they are.

alter table clients add column if not exists tier text not null default 'coaching';
alter table clients add column if not exists birth_date date;
alter table clients add column if not exists offer_id text;
create index if not exists clients_tier_idx on clients (tier);

create table if not exists program_offers (
  id          text primary key default gen_random_uuid()::text,
  coach_id    text not null references users (id),
  slug        text not null unique,
  title       text not null,
  pitch       text,
  template_id text not null references workout_templates (id),
  plan_id     text not null references plans (id),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists offer_visits (
  id         text primary key default gen_random_uuid()::text,
  offer_id   text not null references program_offers (id) on delete cascade,
  visitor    text not null,
  day        date not null,
  created_at timestamptz not null default now(),
  unique (offer_id, visitor, day)
);
create index if not exists offer_visits_offer_id_day_idx on offer_visits (offer_id, day);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_offer_id_fkey') then
    alter table clients
      add constraint clients_offer_id_fkey foreign key (offer_id) references program_offers (id);
  end if;
end $$;

-- Every table in this project has RLS on; the app reads through Prisma with
-- the service role, so no policies are needed for these two.
alter table program_offers enable row level security;
alter table offer_visits enable row level security;
