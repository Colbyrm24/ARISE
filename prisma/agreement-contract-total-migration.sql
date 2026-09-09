-- Snapshot the contract total onto the agreement itself.
--
-- plans.contract_total and the two *_contract_total_override columns already
-- exist and feed {{total_value}} into the agreement text at signing. Nothing
-- stored the resulting figure, so once the coach edited the plan there was no
-- record of what a given client had actually agreed to pay — only the sentence
-- frozen into agreements.rendered_text, which no query can sum against.
--
-- Nullable on purpose. A one-time or fixed payment plan states its end in a
-- number of payments; a second, separately-maintained total would only be
-- another thing to disagree with it.
--
-- Safe to run more than once, and safe to run BEFORE the code that reads it —
-- existing rows simply carry NULL and show no contract progress, which is
-- exactly what they showed yesterday.

ALTER TABLE "agreements"
  ADD COLUMN IF NOT EXISTS "contract_total" DECIMAL(10,2);

-- Verify:
-- SELECT column_name, data_type, numeric_precision, numeric_scale, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'agreements' AND column_name = 'contract_total';
