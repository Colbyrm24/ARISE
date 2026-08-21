'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { parseVideoUrl } from '@/lib/exercise-video';

/**
 * Server Actions for the coach Exercise Library. Every action re-checks
 * that the caller is actually a coach before touching the database — the
 * page only rendering for coaches is a convenience, not the real boundary.
 */

function splitList(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createExercise(formData: FormData) {
  await requireCoach();

  const name = (formData.get('name') as string | null)?.trim();
  const musclePrimary = (formData.get('musclePrimary') as string | null)?.trim();
  const equipment = (formData.get('equipment') as string | null)?.trim();
  const difficulty = (formData.get('difficulty') as string | null)?.trim();
  if (!name || !musclePrimary || !equipment || !difficulty) return;

  const movementPattern = (formData.get('movementPattern') as string | null)?.trim() || null;
  const instructions = (formData.get('instructions') as string | null)?.trim() || null;
  const cues = (formData.get('cues') as string | null)?.trim() || null;
  const commonMistakes = (formData.get('commonMistakes') as string | null)?.trim() || null;
  const muscleSecondary = splitList(formData.get('muscleSecondary'));
  const tags = splitList(formData.get('tags'));

  await prisma.exercise.create({
    data: {
      name,
      musclePrimary,
      muscleSecondary,
      equipment,
      difficulty,
      movementPattern,
      instructions,
      cues,
      commonMistakes,
      substitutions: [],
      tags,
    },
  });

  revalidatePath('/coach/exercises');
}

export async function deleteExercise(formData: FormData) {
  await requireCoach();

  const id = formData.get('id') as string | null;
  if (!id) return;

  try {
    await prisma.exercise.delete({ where: { id } });
  } catch {
    // Still used in a workout somewhere — leave it in place rather than
    // erroring the whole page. The coach will see it's still listed.
  }

  revalidatePath('/coach/exercises');
}

/**
 * Attaches a demo video to an exercise, or clears it when the URL is blank.
 *
 * The ExerciseVideo row is created fresh each time rather than updated. Two
 * exercises could legitimately share a video (a barbell and an EZ-bar curl
 * off one clip), and reusing the row would silently repoint both.
 */
export async function setExerciseVideo(formData: FormData) {
  await requireCoach();

  const exerciseId = (formData.get('exerciseId') as string | null)?.trim();
  if (!exerciseId) return;

  const raw = (formData.get('videoUrl') as string | null)?.trim() ?? '';

  if (!raw) {
    await prisma.exercise.update({ where: { id: exerciseId }, data: { videoId: null } });
    revalidatePath('/coach/exercises');
    return;
  }

  const parsed = parseVideoUrl(raw);
  // A URL we can't parse is silently ignored rather than stored — a broken
  // link shown to a client mid-workout is worse than no link at all.
  if (!parsed) return;

  const video = await prisma.exerciseVideo.create({
    data: {
      storageProvider: parsed.provider,
      externalId: parsed.externalId,
      thumbnailUrl: parsed.thumbnailUrl,
    },
  });

  await prisma.exercise.update({
    where: { id: exerciseId },
    data: { videoId: video.id },
  });

  revalidatePath('/coach/exercises');
}
