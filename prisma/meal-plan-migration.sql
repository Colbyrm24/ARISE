-- Meal plans: a day of meals a coach writes for one client.
--
-- Additive only. Nothing existing changes.

create table if not exists public.meal_plans (
  -- text, not uuid, matching every other String @id in this schema.
  id         text primary key default gen_random_uuid()::text,
  client_id  text not null references public.clients(user_id) on delete cascade,
  coach_id   text references public.users(id),
  name       text not null,
  note       text,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists meal_plans_client_id_active_idx
  on public.meal_plans (client_id, active);

create table if not exists public.meal_plan_items (
  id       text primary key default gen_random_uuid()::text,
  plan_id  text not null references public.meal_plans(id) on delete cascade,
  meal     text not null,
  position integer not null default 0,

  -- Nullable on purpose: a line the coach typed straight in belongs to no
  -- recipe. Set null rather than cascade-deleting the line if the recipe goes
  -- away, so a plan written in September survives a library cleanup in
  -- November with its numbers intact.
  recipe_id text references public.recipes(id) on delete set null,
  food_id   text references public.foods(id)   on delete set null,

  name     text not null,
  quantity numeric(6,2) not null default 1,
  calories integer not null,
  protein  numeric(6,2) not null,
  carbs    numeric(6,2) not null,
  fat      numeric(6,2) not null,
  note     text
);

create index if not exists meal_plan_items_plan_id_idx
  on public.meal_plan_items (plan_id);

-- Read and written only through the service-role client on the server, same
-- as every other table here. The anon key never touches these.
alter table public.meal_plans      enable row level security;
alter table public.meal_plan_items enable row level security;
