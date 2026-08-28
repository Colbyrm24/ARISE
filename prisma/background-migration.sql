-- A background the client picks for themselves.
--
-- Run this in Supabase → SQL Editor before deploying the code that goes with
-- it. Safe to run more than once.
--
-- text, not an enum. The list of themes lives in CSS and will change; a
-- Postgres enum would need a migration every time somebody wants a new
-- colour, and an unknown value here simply falls back to the default.
--
-- Nullable with no default on purpose: NULL means "never chose", which is
-- what every existing row should mean, and is handled as the default theme.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS background text;
