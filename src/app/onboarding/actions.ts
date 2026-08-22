'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { ONBOARDING_STEPS } from '@/lib/onboarding';
import { notifyCoach, displayName } from '@/lib/notifications';

export async function saveOnboardingStep(formData: FormData) {
  const user = await requireClient();

  const stepKey = formData.get('stepKey') as string | null;
  const step = ONBOARDING_STEPS.find((s) => s.key === stepKey);
  if (!step) return;

  // Only fields this step declares get saved — nothing from the form is
  // trusted beyond the known key list.
  const answer: Record<string, string> = {};
  for (const field of step.fields) {
    const raw = formData.get(field.key);
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim().slice(0, 2000);
    if (trimmed) answer[field.key] = trimmed;
  }

  const complete = step.fields
    .filter((f) => f.required)
    .every((f) => Boolean(answer[f.key]));

  await prisma.onboardingResponse.upsert({
    where: { clientId_stepKey: { clientId: user.id, stepKey: step.key } },
    create: {
      clientId: user.id,
      stepKey: step.key,
      answerJson: answer,
      completedAt: complete ? new Date() : null,
    },
    update: {
      answerJson: answer,
      completedAt: complete ? new Date() : null,
    },
  });

  /*
    Is the whole intake done?

    The old version counted completed rows against "steps that have a required
    field" — three, because `lifestyle` has none. But a step with no required
    fields auto-completes (`[].every()` is true), so filling lifestyle first
    made the count hit three early and told the coach the intake was finished
    when it wasn't; fill all four and the count was four against three, so it
    never fired at all. Counting the steps that are actually complete against
    the number of steps is the thing that was meant.
  */
  const completedKeys = await prisma.onboardingResponse.findMany({
    where: { clientId: user.id, completedAt: { not: null } },
    select: { stepKey: true },
  });
  const doneKeys = new Set(completedKeys.map((r) => r.stepKey));
  const allDone = ONBOARDING_STEPS.every((s) => doneKeys.has(s.key));

  if (allDone) {
    /*
      And this is where a client actually becomes active.

      Nothing anywhere wrote `status: 'active'`. Every client who completed
      the whole funnel sat at `onboarding` forever unless the coach noticed
      and clicked a status chip by hand — which meant the console's "active
      clients" segments were empty no matter how many people were being
      coached.

      updateMany with a status filter so this only ever promotes somebody who
      is mid-intake. A paused or cancelled client editing an old answer must
      not quietly reactivate themselves.
    */
    const promoted = await prisma.client.updateMany({
      where: { userId: user.id, status: 'onboarding' },
      data: { status: 'active', startDate: new Date() },
    });

    // Told once, on the transition — not on every subsequent edit.
    if (promoted.count > 0) {
      const name = await displayName(user.id);
      await notifyCoach(user.id, 'check_in', `${name} finished their intake and is now active.`);
    }
  }

  revalidatePath('/onboarding');
  revalidatePath('/today');
  revalidatePath('/welcome');
}
