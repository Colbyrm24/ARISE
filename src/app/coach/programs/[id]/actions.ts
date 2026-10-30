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
import {
  clampWeeks,
  defaultPhaseName,
  IMPLICIT_PHASE_ID,
  phaseRanges,
  resizePhase,
} from '@/lib/program-calendar';
import { ensurePhases, resolvePhase } from '@/lib/program-phases';

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

  // Made inside the phase it was created from. The implicit first phase is
  // left as null, which already reads as the first phase — no row needed.
  const rawPhase = (formData.get('phaseId') as string | null) || null;
  const phaseId =
    rawPhase && rawPhase !== IMPLICIT_PHASE_ID
      ? (await prisma.programPhase.findFirst({ where: { id: rawPhase, templateId }, select: { id: true } }))?.id ?? null
      : null;

  const workout = await prisma.workout.create({
    data: {
      templateId,
      name: `Workout ${count + 1}`,
      dayOrder: (last?.dayOrder ?? 0) + 1,
      estMinutesManual: false,
      phaseId,
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
      phaseId: source.phaseId,
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
    // Off the program calendar too, for the same reason: an item pointing at
    // a deleted workout would deploy a Start button that opens nothing.
    await prisma.$transaction([
      prisma.programDay.deleteMany({ where: { workoutId: workout.id } }),
      prisma.programCalendarItem.deleteMany({ where: { workoutId: workout.id } }),
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
    return {
      ok: false,
      message: 'Nothing to deploy — the calendar and the weekly pattern are both empty. Schedule something first.',
    };
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

/* ------------------------------------------------------------------------ */
/* Training phases                                                           */
/* ------------------------------------------------------------------------ */

function phasePath(templateId: string, phaseId?: string) {
  return phaseId ? `/coach/programs/${templateId}?view=${phaseId}` : `/coach/programs/${templateId}`;
}

/**
 * "+ Add next phase": four weeks after the last one, named the way
 * Trainerize names them ("Week 5 - 8"), and opened straight away.
 */
export async function addPhase(formData: FormData) {
  const coach = await requireCoach();
  const templateId = formData.get('templateId') as string | null;
  if (!templateId || !(await coachOwnsTemplate(coach.id, templateId))) return;

  const phases = await ensurePhases(templateId);
  const ranges = phaseRanges(phases);
  const nextWeek = (ranges[ranges.length - 1]?.endWeek ?? 0) + 1;
  if (nextWeek > 52) return;
  const weeks = Math.min(4, 52 - nextWeek + 1);

  const created = await prisma.programPhase.create({
    data: {
      templateId,
      name: defaultPhaseName(nextWeek, weeks),
      weeks,
      position: (phases[phases.length - 1]?.position ?? 0) + 1,
    },
  });

  revalidatePath(`/coach/programs/${templateId}`);
  redirect(phasePath(templateId, created.id));
}

/**
 * Name, length and summary of one phase, in one submit.
 *
 * A length change moves the calendar with it: growing a phase pushes every
 * later item back so the next phase still starts right after it; shrinking
 * drops the items in the cut weeks and pulls the rest forward. The rule is
 * resizePhase in program-calendar.ts; here it is one delete and one
 * increment, both scoped to the template.
 */
export async function updatePhase(formData: FormData) {
  const coach = await requireCoach();
  const templateId = formData.get('templateId') as string | null;
  if (!templateId || !(await coachOwnsTemplate(coach.id, templateId))) return;

  const resolved = await resolvePhase(templateId, formData.get('phaseId') as string | null);
  if (!resolved) return;
  const { phase, phases } = resolved;

  const name = ((formData.get('name') as string | null) ?? '').trim().slice(0, 80) || phase.name;
  const summary = ((formData.get('summary') as string | null) ?? '').trim().slice(0, 2000) || null;
  const rawWeeks = clampWeeks(formData.get('weeks') ?? phase.weeks);
  // The whole program still has to fit in a year.
  const others = phases.filter((p) => p.id !== phase.id).reduce((n, p) => n + p.weeks, 0);
  const weeks = Math.max(1, Math.min(rawWeeks, 52 - others));

  if (weeks !== phase.weeks) {
    const range = phaseRanges(phases).find((r) => r.id === phase.id)!;
    const items = await prisma.programCalendarItem.findMany({
      where: { templateId, dayIndex: { gte: range.startDay } },
      select: { id: true, dayIndex: true },
    });
    const plan = resizePhase(items, range, weeks);
    await prisma.$transaction([
      prisma.programCalendarItem.deleteMany({ where: { templateId, id: { in: plan.removeIds } } }),
      prisma.programCalendarItem.updateMany({
        where: { templateId, dayIndex: { gt: range.endDay } },
        data: { dayIndex: { increment: plan.delta } },
      }),
      prisma.programPhase.update({ where: { id: phase.id }, data: { name, summary, weeks } }),
    ]);
  } else {
    await prisma.programPhase.update({ where: { id: phase.id }, data: { name, summary } });
  }

  revalidatePath(`/coach/programs/${templateId}`);
}

/**
 * Deletes a phase and its weeks of the calendar; later phases move up.
 *
 * Its workouts are never deleted with it — they may have sessions logged
 * against them — and move to the phase before (or after, for the first).
 * The last phase can't be deleted: a program always has at least one.
 */
export async function deletePhase(formData: FormData) {
  const coach = await requireCoach();

  // `id` is all the shared confirm-to-delete button posts, so the template is
  // derived from the phase row — and never taken from the form anyway.
  const phaseId = (formData.get('phaseId') ?? formData.get('id')) as string | null;
  if (!phaseId) return;
  const row = await prisma.programPhase.findUnique({ where: { id: phaseId }, select: { templateId: true } });
  const templateId = row?.templateId;
  if (!templateId || !(await coachOwnsTemplate(coach.id, templateId))) return;

  const resolved = await resolvePhase(templateId, phaseId);
  if (!resolved || resolved.phases.length < 2) return;
  const { phase, phases } = resolved;

  const index = phases.findIndex((p) => p.id === phase.id);
  const heir = phases[index - 1] ?? phases[index + 1];
  const range = phaseRanges(phases)[index];

  await prisma.$transaction([
    prisma.workout.updateMany({ where: { templateId, phaseId: phase.id }, data: { phaseId: heir.id } }),
    prisma.programCalendarItem.deleteMany({
      where: { templateId, dayIndex: { gte: range.startDay, lte: range.endDay } },
    }),
    prisma.programCalendarItem.updateMany({
      where: { templateId, dayIndex: { gt: range.endDay } },
      data: { dayIndex: { increment: -(range.endDay - range.startDay + 1) } },
    }),
    prisma.programPhase.delete({ where: { id: phase.id } }),
  ]);

  revalidatePath(`/coach/programs/${templateId}`);
  redirect(phasePath(templateId, heir.id));
}

/** Lists a workout under another phase of the same program. */
export async function moveWorkoutToPhase(formData: FormData) {
  const coach = await requireCoach();
  const workout = await ownedWorkout(coach.id, formData.get('workoutId') as string | null);
  if (!workout?.templateId) return;

  const resolved = await resolvePhase(workout.templateId, formData.get('phaseId') as string | null);
  if (!resolved) return;

  await prisma.workout.update({ where: { id: workout.id }, data: { phaseId: resolved.phase.id } });
  revalidatePath(`/coach/programs/${workout.templateId}`);
}
