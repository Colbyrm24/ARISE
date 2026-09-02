import { prisma } from '@/lib/prisma';
import { allStepsDone } from '@/lib/onboarding';

/*
  Becoming active.

  This lived inside the intake form's save action, which meant it could only
  ever happen in one order: pay, sign, then fill the intake. Any other order
  and the client was stranded.

  The other order is not hypothetical — /welcome actively invites it. A client
  who filled the intake while their payment was still pending completed every
  step, was not yet at `onboarding`, so nothing promoted them; then they paid
  and signed, arrived at `onboarding`, and the intake was already finished so
  the save action never ran again. They sat one status short of active
  forever, invisible to every "active clients" view, with no screen anywhere
  offering them a way forward.

  Making it a function both sides call means the promotion happens on
  whichever of the two events lands last.
*/

/** True once the client has completed every step of the intake. */
export async function intakeComplete(clientId: string) {
  const rows = await prisma.onboardingResponse.findMany({
    where: { clientId, completedAt: { not: null } },
    select: { stepKey: true },
  });
  return allStepsDone(rows.map((r) => r.stepKey));
}

/**
 * Promotes a client to active if — and only if — they have both finished the
 * intake and reached `onboarding`. Returns true on the transition itself, so
 * the caller can announce it exactly once.
 *
 * The status filter is what keeps this safe to call from anywhere: a paused or
 * cancelled client editing an old answer must not quietly reactivate
 * themselves, and somebody still at payment_pending must not skip the queue.
 *
 * startDate is only stamped if nothing set one. A client brought across from
 * another platform already has a real start date, typed by the coach on the
 * invite, and it is months old — overwriting it with today would tell every
 * week-count and every "how long have they been with me" answer that they
 * started the day they signed up.
 */
export async function promoteIfIntakeComplete(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { userId: clientId },
    select: { status: true, startDate: true },
  });
  if (!client || client.status !== 'onboarding') return false;
  if (!(await intakeComplete(clientId))) return false;

  const promoted = await prisma.client.updateMany({
    where: { userId: clientId, status: 'onboarding' },
    data: { status: 'active', ...(client.startDate ? {} : { startDate: new Date() }) },
  });

  return promoted.count > 0;
}
