-- Scheduling: coach availability and booked calls.
--
-- Additive only.

alter table public.profiles
  add column if not exists booking_location text;

create table if not exists public.coach_availability (
  id           text primary key default gen_random_uuid()::text,
  coach_id     text not null references public.users(id) on delete cascade,
  -- 0 = Sunday through 6 = Saturday.
  weekday      integer not null check (weekday between 0 and 6),
  -- Minutes from midnight in the coach's own timezone, not an absolute time.
  -- "Tuesdays 9 to 5" has to keep meaning that through a daylight saving
  -- change, which it would not if these were instants.
  start_minute integer not null check (start_minute between 0 and 1440),
  end_minute   integer not null check (end_minute between 0 and 1440),
  slot_minutes integer not null default 30 check (slot_minutes > 0),
  active       boolean not null default true
);

create index if not exists coach_availability_coach_id_weekday_idx
  on public.coach_availability (coach_id, weekday);

create table if not exists public.bookings (
  id           text primary key default gen_random_uuid()::text,
  coach_id     text not null references public.users(id) on delete cascade,
  client_id    text not null references public.users(id) on delete cascade,
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       text not null default 'booked',
  note         text,
  location     text,
  created_at   timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by text
);

-- This constraint is the only thing that actually prevents a double booking.
-- Checking for a clash before inserting is a race: two clients tapping Book
-- in the same second both read an empty slot and both insert. The unique
-- index is what makes it correct; the application-level check exists only to
-- turn the resulting error into a sentence a person can read.
--
-- Partial on purpose. A plain unique would mean a cancelled call kept its slot
-- reserved forever and nobody — including the person who cancelled — could
-- ever book that time again. Prisma cannot express a partial unique, so this
-- index has no counterpart in schema.prisma and there is a comment on the
-- Booking model saying so.
create unique index if not exists bookings_coach_id_starts_at_booked_key
  on public.bookings (coach_id, starts_at)
  where status = 'booked';

create index if not exists bookings_client_id_starts_at_idx
  on public.bookings (client_id, starts_at);
create index if not exists bookings_coach_id_starts_at_idx
  on public.bookings (coach_id, starts_at);

alter table public.coach_availability enable row level security;
alter table public.bookings           enable row level security;
