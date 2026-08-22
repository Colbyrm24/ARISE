-- Fixes found in the end-to-end audit.
--
-- Additive only.

-- Custom foods were global. "Save for next time" wrote into the shared food
-- table and the nutrition search read it unscoped, so one client's saved meal
-- appeared in every other client's results. Library rows keep owner_id null
-- and stay shared, which is what they are for.
alter table public.foods
  add column if not exists owner_id text;

create index if not exists foods_owner_id_idx
  on public.foods (owner_id);

-- Anything already saved by a client is claimed back out of the shared pool.
-- source='custom' is exactly the set that "Save for next time" wrote; the 247
-- seeded rows are source='library' and are left alone.
--
-- There is no owner to attribute them to after the fact, so they are hidden
-- from search rather than reassigned: better a client loses a shortcut than
-- keeps seeing a stranger's food. They stay attached to any nutrition_log
-- that already points at them, so no history is lost.
update public.foods
   set owner_id = '00000000-0000-0000-0000-000000000000'
 where source = 'custom'
   and owner_id is null;
