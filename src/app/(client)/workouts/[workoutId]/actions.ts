'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { markScheduledDone } from '@/lib/scheduled';
import { requireClient } from '@/lib/auth';
import { startOfDayInstantFor } from '@/lib/day';

/*
  `today` is the lifter's today, not the server's.

  This one bounds a `startedAt` timestamp rather than a `@db.Date` column, so
  it takes the INSTANT local midnight happened — not `todayFor`, which is the
  `@db.Date` label for the day and sits at 8pm the previous evening in New
  York. Getting either half wrong splits or merges a session: the old UTC
  midnight opened a second log for a 7pm PDT workout, and bounding by the
  date label swept last night's unfinished session into this morning.
*/
async function getOrCreateTodayLog(
  clientId: string,
  workoutId: string,
  user: Parameters<typeof startOfDayInstantFor>[0]
) {
  const today = startOfDayInstantFor(user);
  const existing = await prisma.workoutLog.findFirst({
    where: { clientId, workoutId, startedAt: { gte: today }, completedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.workoutLog.create({ data: { clientId, workoutId } });
}

/**
 * Is this the heaviest this client has ever gone on this exercise?
 *
 * Compared across the *exercise*, not the set or the workout — a bench press
 * PB is a bench press PB whether it happened on Push A or Push B. The set
 * currently being edited is excluded so re-saving the same row can't make it
 * fail to beat itself.
 *
 * Bodyweight work (no weight entered) never counts, because there's nothing
 * to compare. Reps-based PBs would need their own rule and aren't done yet.
 */
async function detectPr({
  clientId,
  workoutSetId,
  actualWeight,
  excludeLogSetId,
}: {
  clientId: string;
  workoutSetId: string;
  actualWeight: number | null;
  excludeLogSetId?: string;
}): Promise<boolean> {
  if (!actualWeight || actualWeight <= 0) return false;

  const set = await prisma.workoutSet.findUnique({
    where: { id: workoutSetId },
    select: { workoutExercise: { select: { exerciseId: true } } },
  });
  const exerciseId = set?.workoutExercise?.exerciseId;
  if (!exerciseId) return false;

  const best = await prisma.workoutLogSet.aggregate({
    _max: { actualWeight: true },
    where: {
      workoutLog: { clientId },
      workoutSet: { workoutExercise: { exerciseId } },
      ...(excludeLogSetId ? { id: { not: excludeLogSetId } } : {}),
    },
  });

  const previous = best._max.actualWeight ? Number(best._max.actualWeight) : 0;
  return actualWeight > previous;
}

/**
 * The workout, only if it is in the program this client is actually on.
 *
 * The page that renders these forms already refuses a workout outside the
 * assigned program — "never trust the URL alone" — and then the actions it
 * submits to trusted the URL alone. A Server Action is reachable directly,
 * and `requireClient` (not `requireEntitledClient`) means a lead, a paused,
 * or an unassigned account reaches these too. So any client could POST a
 * workoutId from any coach's template and write training history against a
 * program nobody gave them: sessions that never happened on their coach's
 * rail, and personal bests off sets they were never assigned.
 */
async function assignedWorkout(clientId: string, workoutId: string) {
  const [assigned, workout] = await Promise.all([
    prisma.clientProgram.findFirst({
      where: { clientId, active: true },
      select: { templateId: true },
    }),
    prisma.workout.findUnique({ where: { id: workoutId }, select: { id: true, templateId: true } }),
  ]);
  if (!assigned || !workout) return null;
  return workout.templateId === assigned.templateId ? workout : null;
}

/** Logs (or updates) one set's actual weight/reps for today's session. */
export async function logSet(formData: FormData) {
  const user = await requireClient();

  const workoutId = formData.get('workoutId') as string | null;
  const workoutSetId = formData.get('workoutSetId') as string | null;
  if (!workoutId || !workoutSetId) return;

  if (!(await assignedWorkout(user.id, workoutId))) return;

  // And the set has to belong to that workout — two ids on one form, so
  // neither is trusted to vouch for the other.
  const set = await prisma.workoutSet.findUnique({
    where: { id: workoutSetId },
    select: { workoutExercise: { select: { workoutId: true } } },
  });
  if (set?.workoutExercise.workoutId !== workoutId) return;

  const actualWeightRaw = formData.get('actualWeight') as string | null;
  const actualRepsRaw = formData.get('actualReps') as string | null;
  const actualWeight = actualWeightRaw ? Number(actualWeightRaw) : null;
  const actualReps = actualRepsRaw ? Number(actualRepsRaw) : null;

  const log = await getOrCreateTodayLog(user.id, workoutId, user);

  const existingSet = await prisma.workoutLogSet.findFirst({
    where: { workoutLogId: log.id, workoutSetId },
  });

  const isPr = await detectPr({
    clientId: user.id,
    workoutSetId,
    actualWeight,
    excludeLogSetId: existingSet?.id,
  });

  if (existingSet) {
    await prisma.workoutLogSet.update({
      where: { id: existingSet.id },
      data: {
        actualWeight: actualWeight ?? undefined,
        actualReps: actualReps ?? undefined,
        /*
          A blank weight box must not clear a personal best.

          `?? undefined` already protects the weight and the reps — resubmit
          with the weight blank and the stored 225 stays. `isPr` had no such
          guard and was written unconditionally, and `detectPr` returns false
          the moment there is no weight to compare. So resubmitting a PR row
          with only the reps filled in left the row reading 225 lb with the
          flag gone: the PB dropped off the coach's dashboard while the weight
          that earned it was still sitting there.

          This bites without anyone doing anything odd, because a stored
          weight of 0 renders as an empty box — so the form submits blank on a
          set the client never touched.
        */
        ...(actualWeight === null ? {} : { isPr }),
      },
    });
  } else {
    await prisma.workoutLogSet.create({
      data: {
        workoutLogId: log.id,
        workoutSetId,
        actualWeight: actualWeight ?? undefined,
        actualReps: actualReps ?? undefined,
        isPr,
      },
    });
  }

  revalidatePath(`/workouts/${workoutId}`);
}

/** Marks today's session for this workout as complete and totals up volume. */
export async function completeWorkout(formData: FormData) {
  const user = await requireClient();

  const workoutLogId = formData.get('workoutLogId') as string | null;
  const workoutId = formData.get('workoutId') as string | null;
  if (!workoutId) return;

  // Same gate as logSet. This one creates a WorkoutLog from a bare workoutId
  // when none exists, so without it any client could manufacture a completed
  // session — with a duration and a volume — against a workout from a program
  // they were never on.
  if (!(await assignedWorkout(user.id, workoutId))) return;

  /*
    A workout can be finished without a single set logged.

    The button used to be hidden until a WorkoutLog existed, and a log only
    appeared once a set was logged — so a circuit, a bodyweight session, or
    anyone who trains and doesn't log could never mark a session done. Their
    Today card said "Not started" forever and the workout habit never ticked.
  */
  let log = workoutLogId
    ? await prisma.workoutLog.findUnique({ where: { id: workoutLogId }, include: { sets: true } })
    : await prisma.workoutLog.findFirst({
        where: { clientId: user.id, workoutId, completedAt: null },
        orderBy: { startedAt: 'desc' },
        include: { sets: true },
      });

  if (!log) {
    log = await prisma.workoutLog.create({
      data: { clientId: user.id, workoutId, startedAt: new Date() },
      include: { sets: true },
    });
  }
  if (log.clientId !== user.id) return;

  const totalVolume = log.sets.reduce((sum, s) => {
    const w = s.actualWeight ? Number(s.actualWeight) : 0;
    const r = s.actualReps ?? 0;
    return sum + w * r;
  }, 0);

  const completedAt = new Date();
  const duration = Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000);

  await prisma.workoutLog.update({
    where: { id: log.id },
    data: { completedAt, duration, totalVolume },
  });

  /*
    Tick the day on the coach's calendar. That screen draws a filled chip for
    a finished session, and nothing anywhere ever set the field it reads, so
    a client who trained every day still showed a month of hollow chips and
    a header saying "Workouts 0/12".

    Attributed to startedAt, not to now. Somebody who starts at 11:50pm and
    finishes after midnight trained on the earlier day, which is what every
    other query in the app already assumes.
  */
  await markScheduledDone(user.id, 'workout', { workoutId, startedAt: log.startedAt });

  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath('/workouts');
  revalidatePath('/today');
  redirect('/workouts');
}
