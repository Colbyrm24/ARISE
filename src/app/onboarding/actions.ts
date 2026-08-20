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

  // Ping the coach once, when the last step lands — not on every save.
  const done = await prisma.onboardingResponse.count({
    where: { clientId: user.id, completedAt: { not: null } },
  });
  const required = ONBOARDING_STEPS.filter((s) => s.fields.some((f) => f.required)).length;
  if (complete && done === required) {
    const name = await displayName(user.id);
    await notifyCoach(user.id, 'check_in', `${name} finished their intake`);
  }

  revalidatePath('/onboarding');
  revalidatePath('/today');
}
