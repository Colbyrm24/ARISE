-- Photo-read meal estimates.
--
-- Additive only. Every existing row keeps its numbers untouched and gets
-- source = 'manual', which is true: a person typed them.

alter table public.nutrition_logs
  add column if not exists source          text not null default 'manual',
  add column if not exists review_state    text,
  add column if not exists estimate        jsonb,
  add column if not exists reviewed_at     timestamptz,
  add column if not exists reviewed_by_id  text;

-- Text, not uuid, to match users.id — every String @id in this schema maps to
-- text and a uuid column here would break the join.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'nutrition_logs_reviewed_by_id_fkey'
  ) then
    alter table public.nutrition_logs
      add constraint nutrition_logs_reviewed_by_id_fkey
      foreign key (reviewed_by_id) references public.users(id);
  end if;
end $$;

-- Drives the coach's review queue, which reads oldest-unreviewed-first.
--
-- A partial index (where review_state is not null) would be smaller, since
-- most rows are not photo reads. It is deliberately not partial: the name and
-- shape here have to match what @@index([reviewState, createdAt]) in
-- schema.prisma produces, or the next `prisma db push` quietly adds a second
-- index alongside it. Schema and database agreeing is worth more than the
-- few kilobytes on a table this size.
create index if not exists nutrition_logs_review_state_created_at_idx
  on public.nutrition_logs (review_state, created_at);

-- Backfill the source of rows that already point at a food or a recipe, so
-- the column tells the truth about history rather than only about new rows.
update public.nutrition_logs set source = 'recipe'  where recipe_id is not null and source = 'manual';
update public.nutrition_logs set source = 'library' where food_id   is not null and source = 'manual';
