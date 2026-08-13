'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';

/**
 * Server Actions for the single-program builder: add/remove days, and
 * add/remove exercises (with their sets) within a day.
 */

export async function addWorkout(formData: FormData) {
  await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  const name = (formData.get('name') as string | null)?.trim();
  if (!templateId || !name) return;

  const count = await prisma.workout.count({ where: { templateId } });

  await prisma.workout.create({
    data: { templateId, name, dayOrder: count + 1 },
  });

  revalidatePath(`/coach/programs/${templateId}`);
}

export async function deleteWorkout(formData: FormData) {
  await requireCoach();

  const workoutId = formData.get('workoutId') as string | null;
  const templateId = formData.get('templateId') as string | null;
  if (!workoutId || !templateId) return;

  try {
    await prisma.workout.delete({ where: { id: workoutId } });
  } catch {
    // Has logged workouts against it — leave it in place.
  }

  revalidatePath(`/coach/programs/${templateId}`);
}

export async function addWorkoutExercise(formData: FormData) {
  await requireCoach();

  const workoutId = formData.get('workoutId') as string | null;
  const templateId = formData.get('templateId') as string | null;
  const exerciseId = formData.get('exerciseId') as string | null;
  if (!workoutId || !templateId || !exerciseId) return;

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
  await requireCoach();

  const workoutExerciseId = formData.get('workoutExerciseId') as string | null;
  const templateId = formData.get('templateId') as string | null;
  if (!workoutExerciseId || !templateId) return;

  try {
    await prisma.workoutExercise.delete({ where: { id: workoutExerciseId } });
  } catch {
    // Has logged sets against it — leave it in place.
  }

  revalidatePath(`/coach/programs/${templateId}`);
}
