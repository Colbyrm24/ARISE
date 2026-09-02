'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsTemplate } from '@/lib/coach-guard';
import { seedCoachProgram } from '@/lib/program-seed';

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
  const coach = await requireCoach();

  const id = formData.get('id') as string | null;
  if (!id) return;
  /*
    createTemplate twenty lines above stamps coachId, and this never read it
    back — so one POST of another coach's template id destroyed every Workout
    under it and the template with it. The catch below swallows the error, so
    any template not yet deployed to a client deleted cleanly and silently.
  */
  if (!(await coachOwnsTemplate(coach.id, id))) return;

  try {
    await prisma.$transaction([
      prisma.workout.deleteMany({ where: { templateId: id } }),
      prisma.workoutTemplate.delete({ where: { id } }),
    ]);
  } catch (err) {
    /*
      Assigned to a client, or has logged workouts. Both are foreign keys and
      both are right — a client's sessions are their history, and a retired
      assignment is the record that they ran it — so the template stays.

      Still swallowed rather than thrown, because a coach who taps delete on
      a program somebody trained from should not get a crashed page. But it
      is logged now: this ran silent, and the list happily drew a delete
      button on a row where pressing it could not do anything, so the only
      signal was the coach noticing the program was still there. The list
      works the block out for itself and shows "In use" instead, which means
      reaching this line at all is now a sign that something else is wrong.
    */
    console.error('deleteTemplate blocked', {
      templateId: id,
      coachId: coach.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  revalidatePath('/coach/programs');
}

/**
 * Builds Colby's real program into the database — the four sessions with
 * every movement, rest and note, the cardio types, the rest-day messages and
 * the repeating week.
 *
 * Idempotent, so the button can be pressed twice with no consequence, and it
 * never overwrites a video link or a week the coach has since rearranged.
 */
export async function loadCoachProgram() {
  const coach = await requireCoach();
  const result = await seedCoachProgram(coach.id);
  revalidatePath('/coach/programs');
  revalidatePath('/coach/exercises');
  redirect(`/coach/programs/${result.templateId}`);
}
