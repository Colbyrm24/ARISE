-- Master programs and their subscribers.
--
-- Run once in the Supabase SQL editor. Safe to run twice: every statement is
-- guarded. Additive only:
--
-- - start_date is null on every existing client_programs row. A null start
--   reads as "unknown" on the subscriber list and is never resynced, so no
--   existing calendar can be rewritten by this migration or by the first
--   master edit after it.
-- - linked defaults to true. Live sync still only touches a subscription
--   whose rows came from the program calendar (they carry a source_key), so
--   a client deployed from the old repeating week is left exactly as it was
--   until the coach re-adds them.
-- - skipped_keys is empty on every existing row.
--
-- Run order: workout-builder-migration.sql, then program-phases-migration.sql,
-- then this file — and all three BEFORE the code from this branch is
-- deployed. Prisma selects every column of a model by default, so until a
-- column here exists every screen that reads client_programs (Today, the
-- client page, Follow My Split) errors.

alter table client_programs add column if not exists start_date date;
alter table client_programs add column if not exists linked boolean not null default true;
-- Program rows the coach removed or replaced on one client's calendar, by
-- source_key, so a resync from the master never writes them back.
alter table client_programs add column if not exists skipped_keys text[] not null default '{}';

-- The subscriber list and every resync read "active subscriptions of this
-- template".
create index if not exists client_programs_workout_template_id_active_idx
  on client_programs (workout_template_id, active);

-- A resync reads one client's rows of one template.
create index if not exists scheduled_items_client_id_template_id_idx
  on scheduled_items (client_id, template_id);
