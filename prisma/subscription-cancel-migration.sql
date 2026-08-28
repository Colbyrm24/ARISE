-- The coach can end a client's billing from ARISE, either now or when the
-- month they have already paid for runs out.
--
-- Run this in the Supabase SQL editor before deploying. Safe to run twice.

alter table public.subscriptions
  add column if not exists cancel_at_period_end boolean not null default false;

-- Verify:
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'subscriptions' and column_name = 'cancel_at_period_end';
-- Expect one row: boolean, default false.
