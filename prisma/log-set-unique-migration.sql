-- One log row per set per session.
--
-- `logSet` has always been findFirst-then-create with no constraint behind
-- it, so two submits a moment apart both missed the read and both inserted.
-- The screen hides it completely: the page reads the rows through a Map keyed
-- on workoutSetId, so a duplicate is invisible to the client and to the coach
-- — but `completeWorkout` totals volume by summing log.sets, and counts it
-- twice. A client's 225x8 became 3,600 lb of volume instead of 1,800.
--
-- This is the same race the codebase already closed for cardio_logs with a
-- real unique index and an upsert (see cardio-log-migration.sql); the fix was
-- never applied to the busiest writer in the app. It matters more now that
-- Finish saves every filled-in row in one go rather than one row per tap.
--
-- Prisma's own spelling of the name, so a future reconcile recognises it
-- rather than adding a second identical index beside it.
--
-- Safe to run as-is: verified zero duplicate (workout_log_id, workout_set_id)
-- pairs in the database before creating it. If that ever stops being true
-- this will fail rather than corrupt anything — collapse the duplicates with
-- the SELECT below first.
--
--   SELECT workout_log_id, workout_set_id, count(*)
--     FROM workout_log_sets GROUP BY 1, 2 HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS workout_log_sets_workout_log_id_workout_set_id_key
  ON public.workout_log_sets (workout_log_id, workout_set_id);
