'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import {
  coachOwnsClient,
  coachOwnsTemplate,
  ownedWorkout,
  ownedWorkoutExercise,
} from '@/lib/coach-guard';
import { deployProgram, setActiveProgram, DEFAULT_WEEKS } from '@/lib/program-deploy';

/*
  Server Actions for the single-program builder: add/remove days, and
  add/remove exercises (with their sets) within a day.

  Every one of these took a templateId (or a workoutId) off the form and
  wrote, with only `requireCoach()` in front of it — which answers "is this
  person a coach", not "is this their program". `deployToClient`, at the
  bottom of this same file, has always checked `template.coachId`. The
  builders never did.

  Where a row id and a templateId arrive together, the template is derived
  from the row and the submitted one is only used to revalidate a path.
*/

export async function addWorkout(formData: FormData) {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const name = (formData.get('name') as string | null)?.trim();
  if (!templateId || !name) return;
  if (!(await coachOwnsTemplate(coach.id, templateId))) return;

  const count = await prisma.workout.count({ where: { templateId } });

  await prisma.workout.create({
    data: { templateId, name, dayOrder: count + 1 },
  });

  revalidatePath(`/coach/programs/${templateId}`);
}

export async function deleteWorkout(formData: FormData) {
  const coach = await requireCoach();

  const workout = await ownedWorkout(coach.id, formData.get('workoutId') as string | null);
  if (!workout) return;

  try {
    await prisma.workout.delete({ where: { id: workout.id } });
  } catch {
    // Has logged workouts against it — leave it in place.
  }

  revalidatePath(`/coach/programs/${workout.templateId}`);
}

export async function addWorkoutExercise(formData: FormData) {
  const coach = await requireCoach();

  const exerciseId = formData.get('exerciseId') as string | null;
  const owned = await ownedWorkout(coach.id, formData.get('workoutId') as string | null);
  if (!owned || !exerciseId) return;
  const workoutId = owned.id;
  const templateId = owned.templateId;

  const numSets = Math.max(1, Number(formData.get('numSets')) || 3);
  const targetReps = (formData.get('targetReps') as string | null)?.trim() || null;
  const targetWeightRaw = formData.get('targetWeight') as string | null;
  const restSecondsRaw = formData.get('restSeconds') as string | null;
  const targetWeight = targetWeightRaw ? Number(targetWeightRaw) : null;
  const restSeconds = restSecondsRaw ? Number(restSecondsRaw) : null;

  const order = await prisma.workoutExercise.count({ where: { workoutId } });

  const workoutExercise = await prisma.workoutExercise.create({
    data: { workoutId, exerciseId, order: order + 1 },
  });

  await prisma.workoutSet.createMany({
    data: Array.from({ length: numSets }, (_, i) => ({
      workoutExerciseId: workoutExercise.id,
      setNumber: i + 1,
      targetReps,
      targetWeight: targetWeight ?? undefined,
      restSeconds: restSeconds ?? undefined,
    })),
  });

  revalidatePath(`/coach/programs/${templateId}`);
}

export async function deleteWorkoutExercise(formData: FormData) {
  const coach = await requireCoach();

  const owned = await ownedWorkoutExercise(
    coach.id,
    formData.get('workoutExerciseId') as string | null
  );
  if (!owned) return;

  try {
    await prisma.workoutExercise.delete({ where: { id: owned.id } });
  } catch {
    // Has logged sets against it — leave it in place.
  }

  revalidatePath(`/coach/programs/${owned.templateId}`);
}

/* ------------------------------------------------------------------------ */
/* The repeating week, and the deploy that turns it into months.            */
/* ------------------------------------------------------------------------ */

/**
 * Sets one weekday of the template's week.
 *
 * Everything about a day arrives in one submit — what it is, which workout,
 * the cardio and the step target — because a weekday is a single decision and
 * splitting it across four little forms is how a coach ends up with Thursday
 * marked "rest" while still carrying a leg session.
 */
export async function setProgramDay(formData: FormData) {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const weekday = Number(formData.get('weekday'));
  if (!templateId || !Number.isInteger(weekday) || weekday < 1 || weekday > 7) return;
  if (!(await coachOwnsTemplate(coach.id, templateId))) return;

  const kindRaw = (formData.get('kind') as string | null) ?? 'rest';
  const kind = ['workout', 'cardio', 'rest'].includes(kindRaw) ? kindRaw : 'rest';

  // A workout id only means anything on a workout day. Clearing it on the
  // others is what stops a rest day quietly keeping a session attached.
  const workoutId = kind === 'workout' ? ((formData.get('workoutId') as string | null) || null) : null;
  const cardioTypeId = (formData.get('cardioTypeId') as string | null) || null;

  const stepsRaw = Number(formData.get('stepTarget'));
  const stepTarget =
    Number.isFinite(stepsRaw) && stepsRaw > 0 ? Math.min(Math.round(stepsRaw), 100000) : null;

  const minutesRaw = Number(formData.get('cardioMinutes'));
  const cardioMinutes =
    Number.isFinite(minutesRaw) && minutesRaw > 0 ? Math.min(Math.round(minutesRaw), 600) : null;

  const label = ((formData.get('label') as string | null) ?? '').trim() || null;

  await prisma.programDay.upsert({
    where: { templateId_weekday: { templateId, weekday } },
    create: { templateId, weekday, kind, workoutId, cardioTypeId, stepTarget, cardioMinutes, label },
    update: { kind, workoutId, cardioTypeId, stepTarget, cardioMinutes, label },
  });

  revalidatePath(`/coach/programs/${templateId}`);
}

/** Applies one step target to all seven days at once. */
export async function setWeekSteps(formData: FormData) {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const raw = Number(formData.get('stepTarget'));
  if (!templateId || !Number.isFinite(raw) || raw <= 0) return;
  if (!(await coachOwnsTemplate(coach.id, templateId))) return;

  await prisma.programDay.updateMany({
    where: { templateId },
    data: { stepTarget: Math.min(Math.round(raw), 100000) },
  });

  revalidatePath(`/coach/programs/${templateId}`);
}

export type DeployState = { ok: boolean; message: string };

/**
 * Writes the week across a client's calendar for as many weeks as asked.
 *
 * This is the three-minute part: pick a client, pick a start date, press the
 * button, and six months of dated sessions exist. Guarded so a coach can only
 * deploy onto a client who is actually theirs.
 */
export async function deployToClient(
  _prev: DeployState,
  formData: FormData
): Promise<DeployState> {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!templateId || !clientId) return { ok: false, message: 'Pick a client first.' };

  if (!(await coachOwnsClient(coach.id, clientId))) {
    return { ok: false, message: 'That client is not yours.' };
  }

  const template = await prisma.workoutTemplate.findUnique({ where: { id: templateId } });
  if (!template || (template.coachId !== coach.id && coach.role !== 'admin')) {
    return { ok: false, message: 'That program is not yours.' };
  }

  const weeks = Number(formData.get('weeks')) || DEFAULT_WEEKS;

  // A date input gives "2026-08-24" with no timezone. Parsed as UTC on
  // purpose — treating it as local would shift the whole program by a day for
  // anyone west of Greenwich.
  const raw = (formData.get('startDate') as string | null) ?? '';
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date();
  if (Number.isNaN(parsed.getTime())) return { ok: false, message: "That start date didn't read." };

  const result = await deployProgram({ clientId, templateId, startDate: parsed, weeks });

  if (result.created === 0) {
    return { ok: false, message: 'Nothing to deploy — the week is empty. Fill in some days first.' };
  }

  // Keep the assignment record in step, so anything still reading
  // ClientProgram sees the same truth as the calendar just written.
  await setActiveProgram(clientId, templateId);

  revalidatePath(`/coach/programs/${templateId}`);
  revalidatePath(`/coach/clients/${clientId}`);

  const to = result.to.toISOString().slice(0, 10);
  return {
    ok: true,
    message: `${result.created} days written through ${to} — ${result.workoutDays} sessions, ${result.restDays} rest days.${result.removed > 0 ? ` Replaced ${result.removed} from the previous deploy.` : ''}`,
  };
}
