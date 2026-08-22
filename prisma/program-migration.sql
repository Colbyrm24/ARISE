-- Programming, cardio and automatic messages.
--
-- Additive only. Nothing here drops or rewrites an existing column.

-- ---------------------------------------------------------------------------
-- A pasteable demo link per movement, and a real header on a workout.
-- ---------------------------------------------------------------------------

alter table public.exercises
  add column if not exists video_url text;

alter table public.workouts
  add column if not exists est_minutes  integer,
  add column if not exists equipment    text[] not null default '{}',
  add column if not exists instructions text;

-- ---------------------------------------------------------------------------
-- Cardio. A type carries its unit, because walking and a stairmaster are not
-- measured the same way and "cardio: 40" with no unit is a guess.
-- ---------------------------------------------------------------------------

create table if not exists public.cardio_types (
  id             text primary key,
  coach_id       text not null references public.users(id),
  name           text not null,
  unit           text not null default 'steps',
  default_target integer,
  active         boolean not null default true,
  position       integer not null default 0
);

create unique index if not exists cardio_types_coach_name_key
  on public.cardio_types (coach_id, name);

create table if not exists public.cardio_logs (
  id             text primary key,
  client_id      text not null references public.clients(user_id) on delete cascade,
  cardio_type_id text not null references public.cardio_types(id),
  date           date not null,
  minutes        integer,
  steps          integer,
  distance       numeric(6,2),
  note           text,
  created_at     timestamp(3) not null default now()
);

create index if not exists cardio_logs_client_date_idx
  on public.cardio_logs (client_id, date);

-- ---------------------------------------------------------------------------
-- The repeating week. Seven rows describe a program of any length.
-- ---------------------------------------------------------------------------

create table if not exists public.program_days (
  id             text primary key,
  template_id    text not null references public.workout_templates(id) on delete cascade,
  -- ISO weekday: 1 = Monday .. 7 = Sunday.
  weekday        integer not null,
  kind           text not null,
  workout_id     text references public.workouts(id),
  label          text,
  cardio_type_id text references public.cardio_types(id),
  cardio_minutes integer,
  step_target    integer
);

create unique index if not exists program_days_template_weekday_key
  on public.program_days (template_id, weekday);

-- ---------------------------------------------------------------------------
-- What the deploy writes: dated rows on one client's calendar.
--
-- Copied rather than read live off the template, so editing next month cannot
-- rewrite what someone was asked to do last week.
-- ---------------------------------------------------------------------------

create table if not exists public.scheduled_items (
  id             text primary key,
  client_id      text not null references public.clients(user_id) on delete cascade,
  date           date not null,
  kind           text not null,
  label          text not null,
  workout_id     text references public.workouts(id),
  cardio_type_id text references public.cardio_types(id),
  cardio_minutes integer,
  step_target    integer,
  batch_id       text,
  template_id    text references public.workout_templates(id),
  completed_at   timestamp(3)
);

create index if not exists scheduled_items_client_date_idx
  on public.scheduled_items (client_id, date);

create index if not exists scheduled_items_batch_idx
  on public.scheduled_items (batch_id);

-- ---------------------------------------------------------------------------
-- Automatic messages.
--
-- Several rows per trigger on purpose: one rest-day line sent every Thursday
-- for six months stops reading as a coach and starts reading as a cron job.
-- ---------------------------------------------------------------------------

create table if not exists public.auto_messages (
  id       text primary key,
  coach_id text not null references public.users(id),
  trigger  text not null,
  body     text not null,
  active   boolean not null default true,
  position integer not null default 0
);

create index if not exists auto_messages_coach_trigger_idx
  on public.auto_messages (coach_id, trigger);

-- One row per client per day a message actually went out. This is what makes
-- the sender safe to call as often as you like.
create table if not exists public.auto_message_sends (
  id         text primary key,
  client_id  text not null,
  trigger    text not null,
  date       date not null,
  message_id text
);

create unique index if not exists auto_message_sends_client_trigger_date_key
  on public.auto_message_sends (client_id, trigger, date);
