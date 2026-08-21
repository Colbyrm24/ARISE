-- Web push subscriptions.
--
-- Additive only. One row per browser that agreed to receive pushes, so a
-- client on a phone and a laptop is two rows and both ring.

create table if not exists public.push_subscriptions (
  -- text, not uuid. Every String @id in this schema maps to text (there is no
  -- @db.Uuid anywhere), so declaring this as uuid would break Prisma's reads.
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references public.users(id) on delete cascade,
  -- The endpoint IS the browser's identity to the push service. Unique so that
  -- re-subscribing on a device already known updates rather than duplicates.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

-- Read and written only through the service-role client on the server, same as
-- the storage buckets. The anon key never touches this table, so a leaked
-- subscription can't be used to push to someone else's device.
alter table public.push_subscriptions enable row level security;
