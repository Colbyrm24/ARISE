-- Start and finish photos for each exercise (see src/lib/exercise-media.ts).
alter table public.exercises
  add column if not exists image_urls text[] not null default '{}'::text[];
