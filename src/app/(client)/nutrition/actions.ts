'use server';

import { revalidatePath } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import {
  isAllowedMealPhoto,
  mealPhotoPath,
  uploadMealPhoto,
  removeMealPhoto,
} from '@/lib/meal-photos';
import { estimateMealFromPhoto } from '@/lib/meal-estimate';
import { recordProteinGoal } from '@/lib/protein-goal';

/** What the photo logger tells the client, so the screen can say something real. */
export type PhotoLogResult =
  | {
      ok: true;
      name: string;
      calories: number;
      protein: number;
      carbs: number;
      fat: number;
      confidence: 'high' | 'medium' | 'low';
    }
  /** `saved` distinguishes "we kept your photo, just no numbers" from "nothing happened". */
  | { ok: false; error: string; saved?: boolean };

/**
 * The photo input converts everything to JPEG in the browser before upload,
 * which is what makes an iPhone HEIC readable at all. This maps whatever
 * arrives to a type the vision API accepts, defaulting to JPEG rather than
 * refusing — a mislabelled JPEG is far more likely than a genuinely exotic
 * format getting this far past isAllowedMealPhoto().
 */
function mediaTypeFor(type: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' {
  if (type === 'image/png') return 'image/png';
  if (type === 'image/webp') return 'image/webp';
  if (type === 'image/gif') return 'image/gif';
  return 'image/jpeg';
}


/*
  Redraw the two screens a meal changes, and check whether that meal was the
  one that landed the protein goal. Every path that writes a NutritionLog
  already ended here, so this is the one seam where "the day's eating just
  changed" is true for all of them — instrumenting six create sites instead
  would have meant six chances to forget one.
*/
async function refresh(clientId?: string, date?: Date) {
  revalidatePath('/nutrition');
  revalidatePath('/today');
  if (clientId && date) await recordProteinGoal(clientId, date);
}

/** Meal slot, or null if the client didn't pick one. */
function mealOf(formData: FormData) {
  const meal = (formData.get('meal') as string | null) || null;
  return meal && ['breakfast', 'lunch', 'dinner', 'snack'].includes(meal) ? meal : null;
}

/** Quantity as a multiplier of the stated serving. Defaults to one serving. */
function quantityOf(formData: FormData) {
  const raw = formData.get('quantity') as string | null;
  const n = raw ? Number(raw) : 1;
  if (!Number.isFinite(n) || n <= 0) return null;
  // Nobody eats 400 servings — a number that large is a typo, and logging it
  // would wreck the day's totals silently.
  return Math.min(n, 50);
}

export async function logMeal(formData: FormData) {
  const user = await requireClient();
  const recipeId = formData.get('recipeId') as string | null;
  const quantity = quantityOf(formData);
  if (!recipeId || quantity === null) return;

  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) return;

  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: todayFor(user),
      meal: mealOf(formData),
      recipeId: recipe.id,
      source: 'recipe',
      quantity,
      calories: Math.round(recipe.calories * quantity),
      protein: Number(recipe.protein) * quantity,
      carbs: Number(recipe.carbs) * quantity,
      fat: Number(recipe.fat) * quantity,
    },
  });
  await refresh(user.id, todayFor(user));
}

/** Logs a food from the library (or a previously saved custom food). */
export async function logFood(formData: FormData) {
  const user = await requireClient();
  const foodId = formData.get('foodId') as string | null;
  const quantity = quantityOf(formData);
  if (!foodId || quantity === null) return;

  const food = await prisma.food.findUnique({ where: { id: foodId } });
  if (!food) return;

  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: todayFor(user),
      meal: mealOf(formData),
      foodId: food.id,
      source: 'library',
      quantity,
      calories: Math.round(food.calories * quantity),
      protein: Number(food.protein) * quantity,
      carbs: Number(food.carbs) * quantity,
      fat: Number(food.fat) * quantity,
    },
  });
  await refresh(user.id, todayFor(user));
}

/**
 * Log something that isn't in the library at all.
 *
 * This is the one that matters most: a client eating at a restaurant, or a
 * dish someone made for them, has numbers from their coach and nowhere to put
 * them. Without this the whole screen only works for food we happened to
 * think of. `save` optionally keeps it as a custom food so a regular meal
 * only has to be entered once.
 *
 * An optional photo rides along. That's the part that mirrors what already
 * happens over text every day — the client's guess is the starting point and
 * the photo is what lets the coach correct it.
 */
export async function quickAddFood(formData: FormData) {
  const user = await requireClient();

  const name = ((formData.get('name') as string | null) ?? '').trim();
  const calories = Number(formData.get('calories'));
  const protein = Number(formData.get('protein') ?? 0);
  const carbs = Number(formData.get('carbs') ?? 0);
  const fat = Number(formData.get('fat') ?? 0);

  if (!name || name.length > 120) return;
  if (![calories, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) return;
  if (calories > 10000) return;

  // Saving is opt-in, so a one-off restaurant meal doesn't clutter the list
  // the client searches every day.
  const save = formData.get('save') === 'on';

  let foodId: string | null = null;
  if (save) {
    const created = await prisma.food.create({
      data: {
        name,
        source: 'custom',
        // Theirs, not everyone's. Without this the row landed in the shared
        // library and showed up in every other client's search.
        ownerId: user.id,
        calories: Math.round(calories),
        protein,
        carbs,
        fat,
        servingSize: '1 serving',
        category: 'Custom',
      },
    });
    foodId = created.id;
  }

  // Uploaded before the row is written so a storage failure doesn't leave a
  // log pointing at a photo that isn't there. A failed upload is not worth
  // losing the client's numbers over, so it degrades to a log with no photo.
  let photoPath: string | null = null;
  const photo = formData.get('photo');
  const photoUsable =
    photo instanceof File && photo.size > 0 && isAllowedMealPhoto(photo) === null;
  if (photoUsable) {
    const path = mealPhotoPath(user.id, (photo as File).name);
    const err = await uploadMealPhoto(path, photo as File);
    if (!err) photoPath = path;
  }

  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: todayFor(user),
      meal: mealOf(formData),
      foodId,
      quantity: 1,
      calories: Math.round(calories),
      protein,
      carbs,
      fat,
      photoPath,
    },
  });
  await refresh(user.id, todayFor(user));
}

/**
 * Log a meal from a photograph, with the numbers read off the photo.
 *
 * This is the flow the whole app was missing. Every other logging path asks
 * the client to already know what they ate in grams, which is exactly the
 * thing they're paying a coach to work out for them — so in practice they
 * skipped the app and texted a photo instead.
 *
 * Two rules shape the error handling here:
 *
 *  - The log always saves. A read that fails, a model that's down, a photo of
 *    a dog: none of those are allowed to cost the client the entry, because
 *    the photo itself is still evidence the coach can use.
 *  - Nothing is presented as final. The row lands as `estimated` and shows up
 *    in the coach's queue. A number nobody has checked is a starting point,
 *    and the client can tell the difference between a guess and their coach.
 */
export async function logMealFromPhoto(formData: FormData): Promise<PhotoLogResult> {
  const user = await requireClient();

  const photo = formData.get('photo');
  if (!(photo instanceof File) || photo.size === 0) {
    return { ok: false, error: 'Pick a photo first.' };
  }
  // Previously an invalid file was skipped in silence and the log saved with
  // no photo attached. That was survivable when the photo was decoration; now
  // the photo is where the numbers come from, so it has to be said out loud.
  const badPhoto = isAllowedMealPhoto(photo);
  if (badPhoto) return { ok: false, error: badPhoto };

  const description = ((formData.get('description') as string | null) ?? '').trim().slice(0, 300);

  // A read costs money and a stuck loop could run all night. This is not a
  // security boundary, just a ceiling far above anything a person eats.
  const today = todayFor(user);
  const readsToday = await prisma.nutritionLog.count({
    where: { clientId: user.id, date: today, source: 'photo' },
  });
  if (readsToday >= 30) {
    return { ok: false, error: "That's a lot of photos for one day — log the rest by hand." };
  }

  const path = mealPhotoPath(user.id, photo.name);
  const uploadError = await uploadMealPhoto(path, photo);
  if (uploadError) return { ok: false, error: "Couldn't upload that photo. Try again." };

  const bytes = Buffer.from(await photo.arrayBuffer());
  const result = await estimateMealFromPhoto({
    base64: bytes.toString('base64'),
    mediaType: mediaTypeFor(photo.type),
    description: description || null,
  });

  /*
    The read didn't produce a meal. Keep the photo and the row so the coach
    still sees it, and leave the numbers at zero rather than inventing any —
    a wrong number in a day's total is worse than a visible gap.

    `day-summary` lands here deliberately. A screenshot of a tracker's home
    screen is perfectly readable and the client meant to send it; it just
    isn't a meal, and adding 1,807 calories on top of the meals already logged
    that day would double the whole day silently. The figures are carried into
    the row so the coach can still act on them, but nothing is counted.
  */
  if (!result.ok) {
    await prisma.nutritionLog.create({
      data: {
        clientId: user.id,
        date: today,
        meal: mealOf(formData),
        name: description || 'Meal photo',
        quantity: 1,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        photoPath: path,
        source: 'photo',
        reviewState: 'failed',
        estimate: {
          failed: result.reason,
          message: result.message,
          ...(result.dayTotals ? { dayTotals: result.dayTotals } : {}),
        },
      },
    });
    await refresh(user.id, todayFor(user));
    return { ok: false, error: result.message, saved: true };
  }

  const e = result.estimate;
  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: today,
      meal: mealOf(formData),
      name: e.name,
      quantity: 1,
      calories: e.calories,
      protein: e.protein,
      carbs: e.carbs,
      fat: e.fat,
      photoPath: path,
      source: 'photo',
      reviewState: 'estimated',
      estimate: e as unknown as Prisma.InputJsonValue,
    },
  });
  await refresh(user.id, todayFor(user));

  return {
    ok: true,
    name: e.name,
    calories: e.calories,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
    confidence: e.confidence,
  };
}

/**
 * Logs one line of the client's plan in a single tap.
 *
 * The macros come off the plan row, not the recipe behind it. A recipe edited
 * since the plan was written must not change what the client is credited with
 * eating, and the line has to keep working when its recipe is gone.
 */
export async function logPlanItem(formData: FormData) {
  const user = await requireClient();
  const itemId = formData.get('itemId') as string | null;
  if (!itemId) return;

  const item = await prisma.mealPlanItem.findUnique({
    where: { id: itemId },
    include: { plan: { select: { clientId: true, active: true } } },
  });
  // Scoped to the caller, and to a live plan — a retired plan's ids should
  // not still be loggable.
  if (!item || item.plan.clientId !== user.id || !item.plan.active) return;

  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: todayFor(user),
      meal: item.meal,
      recipeId: item.recipeId,
      foodId: item.foodId,
      name: item.name,
      source: 'recipe',
      quantity: item.quantity,
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    },
  });
  await refresh(user.id, todayFor(user));
}

export async function removeMealLog(formData: FormData) {
  const user = await requireClient();
  const logId = formData.get('logId') as string | null;
  if (!logId) return;

  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log || log.clientId !== user.id) return;

  await prisma.nutritionLog.delete({ where: { id: logId } });
  // Storage is cleaned after the row is gone. An orphaned object costs a few
  // cents; a log pointing at a deleted file renders as a broken image.
  if (log.photoPath) await removeMealPhoto(log.photoPath);
  await refresh(user.id, todayFor(user));
}
