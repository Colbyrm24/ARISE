-- Subscription lifecycle: stop fixed payment plans billing forever.
--
-- Run this in Supabase → SQL Editor before deploying the code that goes
-- with it. Safe to run more than once.
--
-- Background: a "fixed payment plan" was created as a Stripe subscription
-- with the agreed number of payments written into its metadata, and nothing
-- ever read that number back. Stripe does not stop on its own, so a
-- six-payment plan kept charging every month. ARISE recorded none of the
-- later charges either — only the one at signup.
--
-- Two changes make the fix possible:
--
--   1. subscriptions.payment_link_id — ties a live subscription back to the
--      payment link that created it, and therefore to the agreed terms
--      (price, frequency, number of payments) on that link. Without it
--      there is no reliable way to know what a running subscription owes.
--
--   2. a unique index on (provider, provider_payment_id) — Stripe retries
--      webhook deliveries, and a replayed invoice would otherwise be
--      recorded as a second payment. Since the payment count is what
--      decides when to cancel, a duplicate would end a plan early.

BEGIN;

-- text, not uuid. Prisma maps `String @id @default(uuid())` to a text column,
-- so payment_links.id is text and a uuid column here cannot be referenced by
-- a foreign key against it (Postgres 42804, "cannot be implemented").
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS payment_link_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_payment_link_id_fkey'
  ) THEN
    ALTER TABLE subscriptions
      ADD CONSTRAINT subscriptions_payment_link_id_fkey
      FOREIGN KEY (payment_link_id) REFERENCES payment_links(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS subscriptions_payment_link_id_idx
  ON subscriptions (payment_link_id);

-- One subscription per Stripe subscription id. The webhook looks a
-- subscription up by this on every invoice, so a duplicate here would mean
-- charges landing against whichever row happened to be found first.
-- Declared in schema.prisma too, so a later `prisma migrate` treats it as
-- intended rather than as drift to drop. Postgres permits many NULLs in a
-- unique index, so rows without a provider id are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_provider_subscription_id_key
  ON subscriptions (provider, provider_subscription_id);

-- The idempotency guard. Stripe may deliver the same invoice event more than
-- once; this makes the second one a no-op instead of a second payment.
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_id_key
  ON payments (provider, provider_payment_id);

COMMIT;
