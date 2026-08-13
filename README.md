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
npm run db:migrate           # creates the actual tables from prisma/schema.prisma
npm run dev
```

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
