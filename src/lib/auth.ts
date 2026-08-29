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

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { profile: true, clientRecord: true },
  });

  return dbUser;
}

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
