-- Workout builder: rest blocks between exercises, and an automatic estimate.
--
-- Run once in the Supabase SQL editor. Safe to run twice: every statement is
-- guarded. Additive only — existing workouts read exactly as before: a null
-- rest_after_seconds means "no rest block", which is what every existing row
-- is, and est_minutes_manual defaults to true so every existing workout keeps
-- the minutes it was given.
--
-- Supersets need no change: workout_exercises.superset_group has been in the
-- table since the start and the builder is the first thing to write it.

alter table workout_exercises add column if not exists rest_after_seconds integer;
alter table workouts add column if not exists est_minutes_manual boolean not null default true;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workout_exercises_rest_after_seconds_check') then
    alter table workout_exercises
      add constraint workout_exercises_rest_after_seconds_check
      check (rest_after_seconds is null or rest_after_seconds between 0 and 3600);
  end if;
end $$;

-- No new table, so there is no new RLS to enable: this only adds a column to
-- a table that already exists, and its access rules are unchanged.
