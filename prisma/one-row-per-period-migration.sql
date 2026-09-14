-- Five invariants the code stated in prose and nothing enforced.
--
-- Every one of these is a check-then-insert with no constraint behind it, and
-- in each case the comment above the code already says what the rule is
-- supposed to be: "one weigh-in per day", "one check-in per week", "one row
-- per habit type per client". Two concurrent writers both miss the check and
-- both insert, and the duplicate is usually invisible — until a chart
-- averages it twice, or a findFirst picks the wrong one of two rows that
-- disagree.
--
-- Run while the database held 4 clients, 3 nutrition targets and zero weight
-- logs, measurements, check-ins and bookings, with every duplicate query below
-- returning no rows. That is the only reason this is five CREATE INDEX
-- statements and not a data migration: once clients are logging, each of these
-- needs its duplicates collapsed first, by hand, deciding which row is the
-- real one.
--
-- Verify before running (all five must return zero rows):
--
--   SELECT client_id, effective_date, count(*) FROM nutrition_targets GROUP BY 1,2 HAVING count(*)>1;
--   SELECT client_id, date, count(*)           FROM weight_logs       GROUP BY 1,2 HAVING count(*)>1;
--   SELECT client_id, date, type, count(*)     FROM measurements      GROUP BY 1,2,3 HAVING count(*)>1;
--   SELECT client_id, week_of, count(*)        FROM check_ins         GROUP BY 1,2 HAVING count(*)>1;
--   SELECT client_id, workout_template_id, count(*) FROM client_programs GROUP BY 1,2 HAVING count(*)>1;

-- The client's macros. The worst of the five: the coach's save always
-- INSERTED, so correcting a typo left two rows for one day and the number the
-- client ate to was whichever Postgres returned first — and it could differ
-- between their Today screen and the coach's card on one page load.
CREATE UNIQUE INDEX IF NOT EXISTS nutrition_targets_client_id_effective_date_key
  ON public.nutrition_targets (client_id, effective_date);

-- One weigh-in per day. Two independent writers: the client's Progress screen
-- and their Apple Health automation.
CREATE UNIQUE INDEX IF NOT EXISTS weight_logs_client_id_date_key
  ON public.weight_logs (client_id, date);

CREATE UNIQUE INDEX IF NOT EXISTS measurements_client_id_date_type_key
  ON public.measurements (client_id, date, type);

-- One check-in per week, or the coach gets two and the adherence number reads
-- whichever it finds.
CREATE UNIQUE INDEX IF NOT EXISTS check_ins_client_id_week_of_key
  ON public.check_ins (client_id, week_of);

-- The constraint setActiveProgram's own comment said did not exist. Its
-- transaction cannot stop two concurrent creates under READ COMMITTED, and the
-- program builder calls the same function on deploy.
CREATE UNIQUE INDEX IF NOT EXISTS client_programs_client_id_workout_template_id_key
  ON public.client_programs (client_id, workout_template_id);

-- ---------------------------------------------------------------------------
-- Two partial indexes, which Prisma's schema language cannot express. They
-- live only here, are documented in schema.prisma where they would otherwise
-- go, and a `db push` would silently drop both — same situation as the
-- bookings index that is the only thing preventing a double-booked call.
-- ---------------------------------------------------------------------------

-- One ACTIVE habit of each kind per client. Custom habits are excluded on
-- purpose: a client is meant to be able to have several, and they are told
-- apart by their text rather than their type. Inactive rows are excluded so
-- that retiring a habit and adding it back still works.
CREATE UNIQUE INDEX IF NOT EXISTS daily_goals_client_id_goal_type_active_key
  ON public.daily_goals (client_id, goal_type)
  WHERE active AND goal_type <> 'custom';

-- One SYNCED nutrition row per meal per day. This table is deliberately
-- many-rows-per-day for everything a client types in, so only the Apple Health
-- rows are constrained. The health route's own comment proposed exactly this
-- index and then accepted the race "to avoid a migration" — it costs nothing
-- while the table is empty.
CREATE UNIQUE INDEX IF NOT EXISTS nutrition_logs_client_id_date_meal_apple_health_key
  ON public.nutrition_logs (client_id, date, meal)
  WHERE source = 'apple_health';

-- ---------------------------------------------------------------------------
-- The plain indexes the new uniques replace.
--
-- Each new unique above leads with the same columns as one of these, and a
-- B-tree serves any leftmost prefix of its own key — so every lookup these
-- were carrying is now carried by the unique. Dropping them keeps the database
-- matching schema.prisma (which declares one index per rule, not two) and
-- takes the duplicate write cost off five tables.
--
-- Names confirmed against pg_indexes before writing this, not guessed.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS public.nutrition_targets_client_id_effective_date_idx;
DROP INDEX IF EXISTS public.weight_logs_client_id_date_idx;
DROP INDEX IF EXISTS public.measurements_client_id_date_idx;
DROP INDEX IF EXISTS public.check_ins_client_id_week_of_idx;
DROP INDEX IF EXISTS public.client_programs_client_id_idx;

-- And one that was redundant from the day it was written: step_logs declares
-- @@unique([clientId, date]) and @@index([clientId, date]) on the same two
-- columns, so the index has never served a query the unique could not.
DROP INDEX IF EXISTS public.step_logs_client_id_date_idx;
