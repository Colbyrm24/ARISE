import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';

/*
  Does this coach actually coach this client?

  Every coach action called requireCoach() and then acted on whatever client
  id arrived in the form. requireCoach only answers "is this person a coach" —
  so with two coach accounts, either one could rewrite the other's clients:
  status, macros, habits, meal plans, payment links. Today there is one coach,
  which is why nothing has gone wrong; that is a fact about the data, not a
  property of the code.

  A Server Action is a public endpoint the moment it exists. The UI never
  offering the wrong id is not a check.
*/

/** The coach, plus a guard bound to them. Throws to /login if not a coach. */
export async function coachFor(clientId: string | null | undefined) {
  const coach = await requireCoach();
  if (!clientId) return { coach, owns: false as const };
  return { coach, owns: await coachOwnsClient(coach.id, clientId) };
}

/**
 * True when the relationship exists, or when the client row points at this
 * coach. Either is enough — the two are kept in step by ensureCoachAssigned,
 * and accepting both means an account that predates one of them still works.
 *
 * Admins pass unconditionally: an admin exists to clean up after coaches.
 */
export async function coachOwnsClient(coachId: string, clientId: string) {
  try {
    const [rel, client, actor] = await Promise.all([
      prisma.coachClientRelationship.findFirst({
        where: { coachId, clientId, status: 'active' },
        select: { id: true },
      }),
      prisma.client.findUnique({ where: { userId: clientId }, select: { coachId: true } }),
      prisma.user.findUnique({ where: { id: coachId }, select: { role: true } }),
    ]);
    if (actor?.role === 'admin') return true;
    return Boolean(rel) || client?.coachId === coachId;
  } catch {
    // A guard that fails open is not a guard.
    return false;
  }
}
