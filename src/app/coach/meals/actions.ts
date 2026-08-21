'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { notify } from '@/lib/notifications';

/*
  Confirming or correcting a read.

  The original estimate is never overwritten. It stays in the estimate column
  exactly as it came back, and a correction only moves the calories/protein/
  carbs/fat columns — which is what makes getReadAccuracy() possible at all.
  Overwriting would save one column and destroy the only feedback loop the
  feature has.
*/

function refresh(clientId: string) {
  revalidatePath('/coach/meals');
  revalidatePath('/coach/dashboard');
  revalidatePath(`/coach/clients/${clientId}`);
}

/** The coach agrees with the numbers as read. One tap, no edits. */
export async function confirmMeal(formData: FormData) {
  const coach = await requireCoach();
  const logId = formData.get('logId') as string | null;
  if (!logId) return;

  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log || log.reviewState === null) return;

  await prisma.nutritionLog.update({
    where: { id: logId },
    data: { reviewState: 'confirmed', reviewedAt: new Date(), reviewedById: coach.id },
  });

  // Told to the client because the number on their screen just changed
  // meaning — it went from a guess to their coach's number, and that is the
  // whole reason they sent the photo.
  await notify(log.clientId, 'nutrition', `Your ${log.name || 'meal'} is confirmed.`);
  refresh(log.clientId);
}

/**
 * The coach changes the numbers.
 *
 * Blank fields keep what's already there rather than zeroing, so correcting
 * only the protein doesn't quietly wipe the fat.
 */
export async function correctMeal(formData: FormData) {
  const coach = await requireCoach();
  const logId = formData.get('logId') as string | null;
  if (!logId) return;

  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log || log.reviewState === null) return;

  function num(field: string, fallback: number, max: number) {
    const raw = (formData.get(field) as string | null)?.trim();
    if (!raw) return fallback;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) return fallback;
    return Math.min(Math.round(n), max);
  }

  const name = ((formData.get('name') as string | null) ?? '').trim().slice(0, 120);
  const calories = num('calories', log.calories, 10000);
  const protein = num('protein', Math.round(Number(log.protein)), 500);
  const carbs = num('carbs', Math.round(Number(log.carbs)), 1000);
  const fat = num('fat', Math.round(Number(log.fat)), 500);

  await prisma.nutritionLog.update({
    where: { id: logId },
    data: {
      name: name || log.name,
      calories,
      protein,
      carbs,
      fat,
      reviewState: 'corrected',
      reviewedAt: new Date(),
      reviewedById: coach.id,
    },
  });

  await notify(
    log.clientId,
    'nutrition',
    `Your ${name || log.name || 'meal'} came to ${calories} cal and ${protein}g protein.`
  );
  refresh(log.clientId);
}

/**
 * Drop a row that shouldn't be in anyone's day — a duplicate, or a photo that
 * turned out not to be food. The photo goes with it; a stranded object in the
 * bucket is the tidier failure than a plate nobody can account for.
 */
export async function discardMeal(formData: FormData) {
  await requireCoach();
  const logId = formData.get('logId') as string | null;
  if (!logId) return;

  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log || log.reviewState === null) return;

  await prisma.nutritionLog.delete({ where: { id: logId } });
  if (log.photoPath) {
    const { removeMealPhoto } = await import('@/lib/meal-photos');
    await removeMealPhoto(log.photoPath);
  }
  refresh(log.clientId);
}
