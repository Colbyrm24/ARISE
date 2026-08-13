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

  if (existingSet) {
    await prisma.workoutLogSet.update({
      where: { id: existingSet.id },
      data: { actualWeight: actualWeight ?? undefined, actualReps: actualReps ?? undefined },
    });
  } else {
    await prisma.workoutLogSet.create({
      data: { workoutLogId: log.id, workoutSetId, actualWeight: actualWeight ?? undefined, actualReps: actualReps ?? undefined },
    });
  }

  revalidatePath(`/workouts/${workoutId}`);
}

/** Marks today's session for this workout as complete and totals up volume. */
export async function completeWorkout(formData: FormData) {
  const user = await requireClient();

  const workoutLogId = formData.get('workoutLogId') as string | null;
  const workoutId = formData.get('workoutId') as string | null;
  if (!workoutLogId || !workoutId) return;

  const log = await prisma.workoutLog.findUnique({
    where: { id: workoutLogId },
    include: { sets: true },
  });
  if (!log || log.clientId !== user.id) return;

  const totalVolume = log.sets.reduce((sum, s) => {
    const w = s.actualWeight ? Number(s.actualWeight) : 0;
    const r = s.actualReps ?? 0;
    return sum + w * r;
  }, 0);

  const completedAt = new Date();
  const duration = Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000);

  await prisma.workoutLog.update({
    where: { id: workoutLogId },
    data: { completedAt, duration, totalVolume },
  });

  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath('/workouts');
  revalidatePath('/today');
  redirect('/workouts');
}
