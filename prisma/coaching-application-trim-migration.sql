-- Coaching application: stop asking "what's stopping you" and training experience.
-- Older rows keep their answers. Safe to re-run.
alter table public.coaching_applications alter column obstacle drop not null;
alter table public.coaching_applications alter column experience drop not null;
