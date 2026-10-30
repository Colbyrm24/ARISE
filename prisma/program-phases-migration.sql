-- Program phases and the Day-N program calendar.
--
-- Run once in the Supabase SQL editor. Safe to run twice: every statement is
-- guarded. Additive only — nothing here changes an existing row:
--
-- - A template with no program_phases rows reads as one implicit phase, and a
--   workout with a null phase_id is listed under the first phase, so every
--   existing program opens exactly as it did.
-- - A template with no program_calendar_items rows deploys from its old
--   repeating week (program_days), so Follow My Split members and every
--   existing client keep getting the calendar they had.
-- - The four new scheduled_items columns are null / false on every existing
--   row, which is what a row from the old deploy is: no note, no written
--   cardio target, no calendar item behind it, never hand-pinned.
--
-- Run order: after workout-builder-migration.sql, before
-- program-subscribers-migration.sql — all three before this branch's code
-- is deployed. Prisma selects every column by default, so a missing
-- scheduled_items or workouts column breaks Today, both calendars and every
-- program screen.

create table if not exists program_phases (
  id          text primary key default gen_random_uuid()::text,
  template_id text not null references workout_templates (id) on delete cascade,
  name        text not null,
  weeks       integer not null default 4 check (weeks between 1 and 52),
  summary     text,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists program_phases_template_id_position_idx
  on program_phases (template_id, position);

alter table workouts add column if not exists phase_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workouts_phase_id_fkey') then
    -- SET NULL, not cascade: deleting a phase must never delete a workout a
    -- client has logged sessions against. A null phase reads as the first.
    alter table workouts
      add constraint workouts_phase_id_fkey
      foreign key (phase_id) references program_phases (id) on delete set null;
  end if;
end $$;

create table if not exists program_calendar_items (
  id             text primary key default gen_random_uuid()::text,
  template_id    text not null references workout_templates (id) on delete cascade,
  day_index      integer not null check (day_index >= 1),
  kind           text not null
                 check (kind in ('workout', 'cardio', 'rest', 'photos', 'bodystats', 'checkin', 'message')),
  -- Cascade: an item pointing at a deleted workout would deploy a Start
  -- button that opens nothing.
  workout_id     text references workouts (id) on delete cascade,
  cardio_type_id text references cardio_types (id),
  cardio_minutes integer check (cardio_minutes is null or cardio_minutes between 1 and 600),
  cardio_target  text,
  step_target    integer check (step_target is null or step_target between 1 and 100000),
  label          text,
  note           text,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists program_calendar_items_template_id_day_index_idx
  on program_calendar_items (template_id, day_index);

alter table scheduled_items add column if not exists note text;
alter table scheduled_items add column if not exists cardio_target text;
alter table scheduled_items add column if not exists source_key text;
alter table scheduled_items add column if not exists pinned boolean not null default false;

create index if not exists scheduled_items_client_id_source_key_idx
  on scheduled_items (client_id, source_key);

-- Every table in this project has RLS on; the app reads through Prisma with
-- the service role, so no policies are needed for these two.
alter table program_phases enable row level security;
alter table program_calendar_items enable row level security;
