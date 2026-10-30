import { prisma } from '@/lib/prisma';
import { readPrescription, thumbnailFor, type BuilderRow } from '@/lib/workout-builder';

/*
  A workout's rows in the shape the builder screen edits.

  Lives here, not in the builder's actions file, on purpose: every export of
  a 'use server' file is a public endpoint, and this takes a bare workout id
  with no ownership check. Callers have already proven the workout is the
  coach's (ownedWorkout, or a coach-scoped findFirst on the page).
*/
export async function loadBuilderRows(workoutId: string): Promise<BuilderRow[]> {
  const rows = await prisma.workoutExercise.findMany({
    where: { workoutId },
    orderBy: { order: 'asc' },
    include: {
      exercise: { include: { video: { select: { thumbnailUrl: true } } } },
      sets: { orderBy: { setNumber: 'asc' } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    exerciseId: r.exerciseId,
    name: r.exercise.name,
    musclePrimary: r.exercise.musclePrimary,
    equipment: r.exercise.equipment,
    thumb: thumbnailFor(r.exercise),
    supersetGroup: r.supersetGroup,
    restAfterSeconds: r.restAfterSeconds,
    notes: r.notes,
    prescription: readPrescription(
      r.sets.map((s) => ({
        type: s.type,
        targetReps: s.targetReps,
        targetWeight: s.targetWeight === null ? null : Number(s.targetWeight),
        restSeconds: s.restSeconds,
        tempo: s.tempo,
      }))
    ),
  }));
}
