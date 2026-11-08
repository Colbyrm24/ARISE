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
    await prisma.exercise.update({
      where: { id: exerciseId },
      data: { videoId: null, videoUrl: null },
    });
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
    // videoUrl keeps exactly what was pasted. videoId keeps what we managed
    // to parse out of it. Storing both means a provider we stop being able to
    // parse doesn't lose the coach's link.
    data: { videoId: video.id, videoUrl: raw },
  });

  revalidatePath('/coach/exercises');
}

/**
 * Puts start/finish photos and how-to steps on every exercise that has a
 * match in the public-domain library (src/lib/exercise-media.ts).
 *
 * One statement, so it can't half-finish on a cold serverless start. Photos
 * are refreshed every time; steps only fill an empty instructions field, so
 * anything the coach wrote himself is never overwritten. Safe to press twice.
 */
export async function loadExerciseMedia() {
  await requireCoach();
  const { EXERCISE_MEDIA, exerciseImageUrls, exerciseStepsText } = await import('@/lib/exercise-media');
  const rows = Object.keys(EXERCISE_MEDIA).map((name) => ({
    name,
    imgs: exerciseImageUrls(name),
    steps: exerciseStepsText(name),
  }));
  await prisma.$executeRaw`
    update exercises e
       set image_urls = v.imgs,
           instructions = coalesce(nullif(e.instructions, ''), v.steps)
      from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as v(name text, imgs text[], steps text)
     where lower(e.name) = lower(v.name)`;
  revalidatePath('/coach/exercises');
}

/**
 * Attaches a YouTube demo to every exercise that has none, from the list in
 * src/lib/exercise-videos.ts (found by searching YouTube for each movement
 * and keeping a short, on-topic demo).
 *
 * One statement: picks the targets once, writes a video row for each and
 * points the exercise at it. Exercises that already have a video — anything
 * the coach pasted — are left alone, so it is safe to press twice.
 */
export async function loadExerciseVideos() {
  await requireCoach();
  const { EXERCISE_VIDEOS } = await import('@/lib/exercise-videos');
  const rows = Object.entries(EXERCISE_VIDEOS).map(([name, yt]) => ({ name, yt }));
  await prisma.$executeRaw`
    with v as (
      select * from jsonb_to_recordset(${JSON.stringify(rows)}::jsonb) as v(name text, yt text)
    ),
    targets as materialized (
      select e.id as eid, v.yt, gen_random_uuid()::text as vid
        from exercises e join v on lower(e.name) = lower(v.name)
       where e.video_id is null
    ),
    ins as (
      insert into exercise_videos (id, storage_provider, external_id, thumbnail_url)
      select vid, 'youtube', yt, 'https://i.ytimg.com/vi/' || yt || '/hqdefault.jpg' from targets
      returning id
    )
    update exercises e
       set video_id = t.vid, video_url = 'https://www.youtube.com/watch?v=' || t.yt
      from targets t
     where e.id = t.eid and exists (select 1 from ins where ins.id = t.vid)`;
  revalidatePath('/coach/exercises');
}
