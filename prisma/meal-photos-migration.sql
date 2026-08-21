-- Meal photos.
--
-- Additive only: one nullable column and one private storage bucket. Safe to
-- re-run, and nothing existing changes behaviour if this is applied before the
-- code that writes to it.

alter table public.nutrition_logs add column if not exists photo_path text;

-- Private on purpose. Every read goes through a short-lived signed URL minted
-- server-side for a caller we already authorized — see src/lib/meal-photos.ts.
-- Nothing here is ever served from a public URL.
insert into storage.buckets (id, name, public)
values ('meal-photos', 'meal-photos', false)
on conflict (id) do nothing;

-- No storage RLS policies are added deliberately. All access runs through the
-- service-role admin client on the server, so the anon key can't reach these
-- objects at all — which is the behaviour we want for client food photos.
