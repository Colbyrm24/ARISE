import { cache } from 'react';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';
import { ensureCoachAssigned } from '@/lib/onboard-client';

/**
 * The real, server-side identity check. Every page that shows private data
 * should call one of the functions below rather than trusting anything
 * passed from the browser (a prop, a query param, a cookie value read
 * directly) — this is what actually stops a client from ever seeing
 * another client's data.
 *
 * This is also where role is decided, full stop. The middleware deliberately
 * makes no role decision: it runs on the Edge and can't read our database,
 * and the version that tried to guess from Supabase metadata made the coach
 * console unreachable.
 */

/*
  Once per request, not once per caller.

  A layout and the page inside it both call one of the require* helpers —
  that is the point of them, each screen proving its own access rather than
  trusting the shell around it. But every call was a full round trip to
  Supabase Auth plus an identical query for the same user row, and on
  /coach/clients/[id] there are three of them. React's `cache` keeps the
  guarantee and drops the repetition: the checks still all run, they just
  share one answer for the duration of a single request.

  Scoped to one render, so it can't serve one person's identity to another —
  a plain module-level variable here would be exactly that bug.
*/
/*
  A Supabase session with no row of ours is a bricked account. This unbricks it.

  Every screen in ARISE joins against our own `users` table, and exactly two
  places ever wrote a row into it — the signup route and the join route — both
  fired from the browser, both after the Supabase account already exists. So
  there is a window, and landing in it was permanent:

  getCurrentUser returned null for "no session" AND for "real session, no row
  of ours". The root page sends null to /login. The middleware decides signed-
  in from the cookie's JWT alone — it runs on the Edge and cannot read the
  database — so it sends anyone with a live cookie off /login back to /. That
  is a redirect loop with no exit, on every route, with no reachable sign-out
  button. The person's only escape was clearing site data.

  Three real ways in: the signup page never checked the response and pushed
  on to /onboarding regardless; the join form's fetch could reject after the
  Supabase account was made; and an auth-callback link (a coach inviting
  somebody straight from the Supabase dashboard) has no row-creating step at
  all, so it looped on the very first click, every time.

  Repairing beats refusing. The session is real and already verified by
  Supabase, and this writes exactly what the signup route writes. `create`
  rather than `upsert` because we only get here when the row is missing, and
  a unique-violation from a racing tab is caught and re-read below.
*/
async function repairMissingUserRow(id: string, email: string) {
  try {
    const created = await prisma.user.create({
      data: {
        id,
        email,
        // The safe default. A coach's row is made by hand and is not the
        // account that goes missing; guessing "coach" here would hand the
        // console to somebody who should not have it.
        role: 'client',
        profile: { create: {} },
        clientRecord: { create: { status: 'lead' } },
      },
      include: { profile: true, clientRecord: true },
    });

    // Same attachment the signup route does, or they arrive un-coached: no
    // inbox thread, no notifications, nobody to book with.
    await ensureCoachAssigned(created.id);

    return created;
  } catch {
    /*
      Two tabs can race this. Whoever lost re-reads rather than failing — and
      if the read comes back empty too, something else is wrong and null is
      the honest answer.
    */
    return prisma.user
      .findUnique({ where: { id }, include: { profile: true, clientRecord: true } })
      .catch(() => null);
  }
}

export const getCurrentUser = cache(async () => {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { profile: true, clientRecord: true },
  });

  if (dbUser) return dbUser;

  // Signed in as far as Supabase is concerned, but we have no row for them.
  // See repairMissingUserRow — this is the difference between a working
  // account and an inescapable redirect loop.
  if (!user.email) return null;
  return repairMissingUserRow(user.id, user.email);
});

/**
 * Where the person was trying to go, so login can send them back.
 *
 * Read from the middleware's header rather than passed in, so every caller
 * gets it without having to remember. Falls back to nothing, which just
 * means login lands on the default.
 */
function currentPath() {
  try {
    const h = headers();
    return h.get('x-invoke-path') || h.get('x-pathname') || '';
  } catch {
    return '';
  }
}

function toLogin(): never {
  const path = currentPath();
  redirect(path ? `/login?next=${encodeURIComponent(path)}` : '/login');
}

/**
 * Statuses that mean "this person has paid and is being coached".
 *
 * Everything before `onboarding` is somebody who hasn't bought yet. Without
 * this gate the entire paid product — programs, nutrition, the AI coach,
 * booking — was reachable by anyone who created an account, because the
 * client layout only ever checked role.
 *
 * `paused` is deliberately NOT in here. It used to be, which meant the one
 * status the billing code reaches for when a card dies still handed over the
 * whole product. Pausing somebody now actually pauses them — they land on
 * /welcome with a line telling them to sort payment out, and one click in the
 * console puts them back. Nothing is deleted either way.
 */
const ENTITLED = new Set(['onboarding', 'active', 'ending_soon', 'completed']);

export function isEntitled(status: string | null | undefined) {
  return Boolean(status && ENTITLED.has(status));
}

/** Use at the top of any client-only page/layout. Redirects if not a client. */
export async function requireClient() {
  const user = await getCurrentUser();
  if (!user) toLogin();
  if (user.role !== 'client') redirect('/');

  // Repairs an account that predates client-to-coach assignment existing.
  // Only fires for orphans, so it costs nothing once a client is attached.
  if (user.clientRecord && !user.clientRecord.coachId) {
    await ensureCoachAssigned(user.id);
  }

  return user;
}

/**
 * A client who has actually bought coaching.
 *
 * Separate from requireClient so the two screens a lead legitimately needs —
 * their profile and the intake form — stay reachable while the rest of the
 * app does not.
 */
export async function requireEntitledClient() {
  const user = await requireClient();
  if (!isEntitled(user.clientRecord?.status)) redirect('/welcome');
  return user;
}

/** Use at the top of any coach-only page/layout. Redirects if not a coach/admin. */
export async function requireCoach() {
  const user = await getCurrentUser();
  if (!user) toLogin();
  if (user.role !== 'coach' && user.role !== 'admin') redirect('/');
  return user;
}
