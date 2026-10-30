'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import {
  coachOwnsClient,
  coachOwnsTemplate,
  ownedWorkout,
} from '@/lib/coach-guard';
import { deployProgram, setActiveProgram, DEFAULT_WEEKS } from '@/lib/program-deploy';

/*
  Server Actions for the program page: create, duplicate and delete the
  workouts in a program. Editing what is IN a workout lives with the workout
  builder, in ./workouts/[workoutId]/actions.ts.

  Every one of these took a templateId (or a workoutId) off the form and
  wrote, with only `requireCoach()` in front of it — which answers "is this
  person a coach", not "is this their program". `deployToClient`, at the
  bottom of this same file, has always checked `template.coachId`. The
  builders never did.

  Where a row id and a templateId arrive together, the template is derived
  from the row and the submitted one is only used to revalidate a path.
*/

/**
 * "New workout": makes one and opens it in the builder.
 *
 * Created with a placeholder name rather than asking first, the way
 * Trainerize does — the name box is the first thing on the builder, and a
 * form in front of the form is one more screen on a phone. The minutes start
 * automatic, so the builder's estimate fills them in as movements go in.
 */
export async function newWorkout(formData: FormData) {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  if (!templateId) return;
  if (!(await coachOwnsTemplate(coach.id, templateId))) return;

  const last = await prisma.workout.findFirst({
    where: { templateId },
    orderBy: { dayOrder: 'desc' },
    select: { dayOrder: true },
  });
  const count = await prisma.workout.count({ where: { templateId } });

  const workout = await prisma.workout.create({
    data: {
      templateId,
      name: `Workout ${count + 1}`,
      dayOrder: (last?.dayOrder ?? 0) + 1,
      estMinutesManual: false,
    },
  });

  revalidatePath(`/coach/programs/${templateId}`);
  redirect(`/coach/programs/${templateId}/workouts/${workout.id}`);
}

/**
 * A full copy of a workout — header, every movement, every set, supersets and
 * rest blocks — placed at the end of the program as "<name> (copy)".
 *
 * Superset ids are remapped rather than copied, so the copy's supersets can
 * never be mistaken for the original's if the two ever share a list.
 */
export async function duplicateWorkout(formData: FormData) {
  const coach = await requireCoach();

  const owned = await ownedWorkout(coach.id, (formData.get('workoutId') ?? formData.get('id')) as string | null);
  if (!owned || !owned.templateId) return;

  const source = await prisma.workout.findUnique({
    where: { id: owned.id },
    include: {
      workoutExercises: { orderBy: { order: 'asc' }, include: { sets: { orderBy: { setNumber: 'asc' } } } },
    },
  });
  if (!source) return;

  const last = await prisma.workout.findFirst({
    where: { templateId: owned.templateId },
    orderBy: { dayOrder: 'desc' },
    select: { dayOrder: true },
  });

  const groups = new Map<string, string>();
  const groupFor = (g: string | null) => {
    if (!g) return null;
    if (!groups.has(g)) groups.set(g, randomUUID());
    return groups.get(g)!;
  };

  await prisma.workout.create({
    data: {
      templateId: owned.templateId,
      name: `${source.name} (copy)`.slice(0, 120),
      dayOrder: (last?.dayOrder ?? 0) + 1,
      estMinutes: source.estMinutes,
      estMinutesManual: source.estMinutesManual,
      equipment: source.equipment,
      instructions: source.instructions,
      workoutExercises: {
        create: source.workoutExercises.map((we) => ({
          exerciseId: we.exerciseId,
          order: we.order,
          supersetGroup: groupFor(we.supersetGroup),
          notes: we.notes,
          restAfterSeconds: we.restAfterSeconds,
          sets: {
            create: we.sets.map((s) => ({
              setNumber: s.setNumber,
              type: s.type,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetRir: s.targetRir,
              tempo: s.tempo,
              restSeconds: s.restSeconds,
            })),
          },
        })),
      },
    },
  });

  revalidatePath(`/coach/programs/${owned.templateId}`);
}

export async function deleteWorkout(formData: FormData) {
  const coach = await requireCoach();

  // `id` is what the shared confirm-to-delete button posts.
  const workout = await ownedWorkout(coach.id, (formData.get('workoutId') ?? formData.get('id')) as string | null);
  if (!workout) return;

  try {
    /*
      Unpin it from the week first.

      program_days.workout_id has no on-delete action, so deleting a workout
      that a weekday still points at throws — and the catch below swallowed
      it, so the trash icon silently did nothing for any day that had been
      placed on the calendar. The row is deleted rather than blanked because
      a program_days row with kind='workout' and no workout is the state the
      client's Today screen renders as a dead Start button.
    */
    await prisma.$transaction([
      prisma.programDay.deleteMany({ where: { workoutId: workout.id } }),
      prisma.workout.delete({ where: { id: workout.id } }),
    ]);
  } catch {
    // Deployed to a client, or has logged sessions against it — both are
    // foreign keys and both are right, so it stays.
  }

  revalidatePath(`/coach/programs/${workout.templateId}`);
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
