'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

async function getOrCreateTodayLog(clientId: string, workoutId: string) {
  const today = todayDateOnly();
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

/** Logs (or updates) one set's actual weight/reps for today's session. */
export async function logSet(formData: FormData) {
  const user = await requireClient();

  const workoutId = formData.get('workoutId') as string | null;
  const workoutSetId = formData.get('workoutSetId') as string | null;
  if (!workoutId || !workoutSetId) return;

  const actualWeightRaw = formData.get('actualWeight') as string | null;
  const actualRepsRaw = formData.get('actualReps') as string | null;
  const actualWeight = actualWeightRaw ? Number(actualWeightRaw) : null;
  const actualReps = actualRepsRaw ? Number(actualRepsRaw) : null;

  const log = await getOrCreateTodayLog(user.id, workoutId);

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
        isPr,
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

  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath('/workouts');
  revalidatePath('/today');
  redirect('/workouts');
}
