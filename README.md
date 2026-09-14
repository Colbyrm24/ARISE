# ARISE — Phase 1: Foundation

Private coaching platform. This is the foundation layer: authentication, roles, database schema, the design system, and both app shells (client + coach console). No coaching features (payments, workouts, nutrition, etc.) are built yet — those come in Phases 2–9, in the order laid out in `coaching-platform-architecture.md`.

## What's in Phase 1

- **Design system** — dark/minimal/premium theme (Tailwind + shadcn-style components) in `src/components/ui`
- **Database schema** — the full schema from the architecture doc, as a real Prisma schema (`prisma/schema.prisma`), ready to migrate
- **Auth** — Supabase Auth (email/password), with role-based routing enforced in `src/middleware.ts` and again on every page via `src/lib/auth.ts` (`requireClient()` / `requireCoach()`)
- **Client app shell** — bottom nav (Today / Workouts / Nutrition / Messages / Profile), Today dashboard wired to real data with honest empty states for features not built yet
- **Coach console shell** — left nav (Dashboard / Clients / Inbox / Programs / Exercises / Recipes / Payments / Settings), dashboard wired to real counts

## Running it

This code was written in a sandboxed environment with no internet access, so it has **not** been installed or run yet — see the setup guide for what that means and what to do next. Once you're in an environment with internet:

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase values
npm run dev
```

### Never run `prisma migrate dev` or `prisma db push` against this database

There is no usable migration history. The tables were created with
`prisma db push` and then changed by the loose `.sql` files in `prisma/`,
applied by hand in the Supabase SQL editor — `prisma/migrations/` holds one
folder and there is no `migration_lock.toml`. So Prisma compares the live
schema against a history that does not describe it, declares drift, and offers
to **reset**: drop every table, with `DATABASE_URL` pointing at production.

`npm run db:migrate` was exactly that command, and the line above used to tell
a new operator to run it. It is now `npm run db:status`, which only reports.
`db push` is no safer for a different reason — it removes anything not declared
in `schema.prisma`, including the partial unique index on `bookings` that is
the only thing stopping two clients booking the same slot.

Until the database is baselined properly (one migration per hand-applied
`.sql` file, marked applied with `prisma migrate resolve --applied`), a schema
change means: write a new `.sql` file in `prisma/`, run it in the Supabase SQL
editor, and mirror it into `prisma/schema.prisma` by hand.

## Project structure

```
src/
  app/
    (auth)/login, (auth)/signup      -> sign in / create account
    (client)/today, workouts, ...    -> the client app (bottom nav)
    coach/dashboard, clients, ...    -> the coach console (left nav)
    api/auth/complete-signup         -> mirrors a new Supabase user into our own database
  components/
    ui/                              -> design system primitives (Button, Card, Input, ...)
    client/                          -> client-app-only components (bottom nav, AI button)
    coach/                           -> coach-console-only components (sidebar)
  lib/
    supabase/                        -> browser + server Supabase clients
    auth.ts                          -> the real, server-side "who is this and what role" checks
    prisma.ts                        -> shared database client
prisma/
  schema.prisma                      -> the full database schema
```
