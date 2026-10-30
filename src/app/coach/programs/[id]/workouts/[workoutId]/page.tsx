import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { loadBuilderRows } from '@/lib/workout-rows';
import { thumbnailFor, type LibraryItem } from '@/lib/workout-builder';
import { WorkoutBuilder } from '@/components/coach/workout-builder';
import {
  saveWorkoutDetails,
  addExerciseToWorkout,
  reorderWorkout,
  saveRow,
  setRestAfter,
  duplicateRows,
  deleteRows,
  createCustomExercise,
} from './actions';

/*
  The workout builder, as its own route.

  A route rather than a modal over the program page so it deep-links — a
  coach can bookmark "Push Day", or open it from a text on his phone — and so
  the back button does what it looks like it will. It still covers the whole
  screen, sidebar included, the way Trainerize's builder does: this is a
  focused job, and the console's navigation is a distraction from it.
*/
export default async function WorkoutBuilderPage({ params }: { params: { id: string; workoutId: string } }) {
  const coach = await requireCoach();

  /*
    Owned, not merely existing — the same rule as the program page. The
    workout must be in THIS template and the template must be this coach's,
    and "not yours" gets the same 404 as "does not exist".
  */
  const workout = await prisma.workout.findFirst({
    where: {
      id: params.workoutId,
      templateId: params.id,
      ...(coach.role === 'admin' ? {} : { template: { coachId: coach.id } }),
    },
    include: { template: { select: { id: true, name: true } } },
  });
  if (!workout || !workout.template) notFound();

  const [rows, exercises] = await Promise.all([
    loadBuilderRows(workout.id),
    prisma.exercise.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        musclePrimary: true,
        equipment: true,
        videoUrl: true,
        video: { select: { thumbnailUrl: true } },
      },
    }),
  ]);

  const library: LibraryItem[] = exercises.map((e) => ({
    id: e.id,
    name: e.name,
    musclePrimary: e.musclePrimary,
    equipment: e.equipment,
    thumb: thumbnailFor(e),
  }));

  return (
    <WorkoutBuilder
      programId={workout.template.id}
      programName={workout.template.name}
      workout={{
        id: workout.id,
        name: workout.name,
        instructions: workout.instructions,
        estMinutes: workout.estMinutes,
        estMinutesManual: workout.estMinutesManual,
        equipment: workout.equipment,
      }}
      initialRows={rows}
      library={library}
      actions={{
        saveWorkoutDetails,
        addExerciseToWorkout,
        reorderWorkout,
        saveRow,
        setRestAfter,
        duplicateRows,
        deleteRows,
        createCustomExercise,
      }}
    />
  );
}
