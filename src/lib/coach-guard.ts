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
 * Does this coach own this program template?
 *
 * `WorkoutTemplate.coachId` is a required column and `deployToClient` already
 * checked it — but the six actions that *build* a template did not, so one
 * POST could turn Wednesday into a rest day on another coach's flagship
 * program, or rewrite the step target on all seven days of any template in
 * the database.
 */
export async function coachOwnsTemplate(coachId: string, templateId: string | null | undefined) {
  if (!templateId) return false;
  try {
    const [template, actor] = await Promise.all([
      prisma.workoutTemplate.findUnique({
        where: { id: templateId },
        select: { coachId: true },
      }),
      prisma.user.findUnique({ where: { id: coachId }, select: { role: true } }),
    ]);
    if (!template) return false;
    if (actor?.role === 'admin') return true;
    return template.coachId === coachId;
  } catch {
    return false;
  }
}

/**
 * A workout, resolved to its own template rather than the one on the form.
 *
 * The two ids arrive side by side and only one of them addresses the row that
 * gets written, which is exactly the shape that made `markPaymentLinkPaid`
 * exploitable: submit a template you own next to a workout you don't and the
 * check passes while the delete lands somewhere else. So the template is
 * derived from the workout and the submitted one is never trusted.
 */
export async function ownedWorkout(coachId: string, workoutId: string | null | undefined) {
  if (!workoutId) return null;
  const workout = await prisma.workout.findUnique({
    where: { id: workoutId },
    select: { id: true, templateId: true },
  });
  if (!workout) return null;
  return (await coachOwnsTemplate(coachId, workout.templateId)) ? workout : null;
}

/** Same, one level down: an exercise row resolved through its workout. */
export async function ownedWorkoutExercise(coachId: string, id: string | null | undefined) {
  if (!id) return null;
  const row = await prisma.workoutExercise.findUnique({
    where: { id },
    select: { id: true, workout: { select: { templateId: true } } },
  });
  if (!row) return null;
  return (await coachOwnsTemplate(coachId, row.workout.templateId))
    ? { id: row.id, templateId: row.workout.templateId }
    : null;
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
