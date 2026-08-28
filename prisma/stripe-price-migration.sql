-- Plans can point at a Price that already exists in Stripe.
--
-- Run this in the Supabase SQL editor before deploying the code that reads
-- these columns. Safe to run twice.

alter table public.plans
  add column if not exists stripe_price_id  text,
  add column if not exists stripe_product_id text;

-- One ARISE plan per Stripe price, so re-running the import updates the plan
-- that price already created instead of stacking duplicates on the payment
-- link dropdown. Nulls stay distinct in Postgres, so every hand-made plan is
-- unaffected by this.
create unique index if not exists plans_stripe_price_id_key
  on public.plans (stripe_price_id);

-- Verify:
--   select column_name, data_type
--   from information_schema.columns
--   where table_name = 'plans' and column_name like 'stripe%';
-- Expect two rows, both text.
