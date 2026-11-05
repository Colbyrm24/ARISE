-- Coaching application: ask monthly income, stop asking when they'll start.
-- Additive and safe to re-run. Older rows keep their start_when answer.
alter table public.coaching_applications add column if not exists monthly_income text;
alter table public.coaching_applications alter column start_when drop not null;
