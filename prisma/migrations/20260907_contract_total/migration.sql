-- What the whole program costs, when that is a different question from what
-- each payment costs.
--
-- A rolling subscription has no payment count to multiply, so the total
-- cannot be derived: $250/month toward a $4,500 program is 18 charges only if
-- nobody ever pays a lump early. The agreement has to state the figure the
-- client is actually committing to, so it has to be stored.
--
-- All three are nullable with no default and no backfill. Every existing plan,
-- invite and payment link keeps behaving exactly as it does today -- the
-- agreement variable falls back to the per-payment price when the total is
-- null, which is correct for the plans where one payment IS the whole thing.

ALTER TABLE "plans"
  ADD COLUMN IF NOT EXISTS "contract_total" DECIMAL(10,2);

ALTER TABLE "client_invites"
  ADD COLUMN IF NOT EXISTS "contract_total_override" DECIMAL(10,2);

ALTER TABLE "payment_links"
  ADD COLUMN IF NOT EXISTS "contract_total_override" DECIMAL(10,2);
