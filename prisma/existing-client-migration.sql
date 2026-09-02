-- Bringing across a client who is already paying.
--
-- He is moving a book of clients off Trainerize. Those people have live
-- payment plans running somewhere else, and sending them through the Stripe
-- checkout would either charge them a second time or, when they refused,
-- strand them at payment_pending with no way into the app they were just told
-- to download. Neither is a thing to discover with a real client on the other
-- end of it.
--
-- So an invite can now skip the money. The account, the coach attachment and
-- the intake all still happen; the payment link and the agreement do not.
--
-- Safe to run more than once.
alter table public.client_invites
  add column if not exists skip_payment boolean not null default false;

-- The agreement template comes with the checkout. An invite that skips
-- payment has nothing to sign, so this stops being required.
alter table public.client_invites
  alter column agreement_template_id drop not null;
