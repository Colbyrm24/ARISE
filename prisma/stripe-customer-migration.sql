-- One Stripe Customer per person, so a card can be fixed by the person whose
-- card it is.
--
-- Nothing stored a customer id before this. Every checkout let Stripe mint a
-- fresh Customer, so a client who bought twice became two people at Stripe —
-- and with no single customer to hang a billing portal off, a declining card
-- was a dead end: the coach could watch it fail and the client had no way to
-- update anything.
--
-- Unique because two clients sharing one Stripe Customer would let either of
-- them open a portal onto the other's payment methods and invoices. The
-- constraint is the guard, not a convention.
--
-- Safe to run more than once.
alter table public.clients
  add column if not exists stripe_customer_id text;

-- Postgres already allows many NULLs under a unique index, so this stays a
-- plain one — and keeps the name Prisma would generate, so a later
-- introspection sees the column it expects rather than drift to reconcile.
create unique index if not exists clients_stripe_customer_id_key
  on public.clients (stripe_customer_id);
