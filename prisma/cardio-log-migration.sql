-- One cardio log per client, per type, per day.
--
-- Run this in Supabase → SQL Editor before deploying the code that goes with
-- it. Safe to run more than once.
--
-- The client's Today screen upserts against this constraint. Without it, two
-- submits a moment apart — a double tap on a slow connection — both miss the
-- existence check and both insert, and since the screen reads with findFirst
-- the duplicate is invisible to the client and to the coach while quietly
-- doubling that day in any future total.
--
-- If duplicates already exist they have to go first, otherwise creating the
-- index fails. The newest row per (client, type, day) wins, on the grounds
-- that a second log of the same session was someone correcting the first.

BEGIN;

DELETE FROM cardio_logs a
USING cardio_logs b
WHERE a.client_id = b.client_id
  AND a.cardio_type_id = b.cardio_type_id
  AND a.date = b.date
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS cardio_logs_client_type_date_key
  ON cardio_logs (client_id, cardio_type_id, date);

COMMIT;
