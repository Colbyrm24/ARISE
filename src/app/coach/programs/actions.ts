'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';

/**
 * Server Actions for the top-level Programs list. A "template" here covers
 * both reusable programs (assign to many clients) and one-off custom
 * programs (create it, assign it to a single client) — there's no separate
 * "custom program" concept, just a template that only ever gets assigned
 * once. Keeping one model means the same builder works for both cases.
 */

export async function createTemplate(formData: FormData) {
  const coach = await requireCoach();

  const name = (formData.get('name') as string | null)?.trim();
  if (!name) return;
  const description = (formData.get('description') as string | null)?.trim() || null;

  const template = await prisma.workoutTemplate.create({
    data: { coachId: coach.id, name, description },
  });

  revalidatePath('/coach/programs');
  redirect(`/coach/programs/${template.id}`);
}

export async function deleteTemplate(formData: FormData) {
  await requireCoach();

  const id = formData.get('id') as string | null;
  if (!id) return;

  try {
    await prisma.$transaction([
      prisma.workout.deleteMany({ where: { templateId: id } }),
      prisma.workoutTemplate.delete({ where: { id } }),
    ]);
  } catch {
    // Assigned to a client, or has logged workouts — leave it in place
    // rather than erroring the whole page.
  }

  revalidatePath('/coach/programs');
}
