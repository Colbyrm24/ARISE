'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import {
  isAllowedMealPhoto,
  mealPhotoPath,
  uploadMealPhoto,
  removeMealPhoto,
} from '@/lib/meal-photos';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function refresh() {
  revalidatePath('/nutrition');
  revalidatePath('/today');
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
      date: todayDateOnly(),
      meal: mealOf(formData),
      recipeId: recipe.id,
      quantity,
      calories: Math.round(recipe.calories * quantity),
      protein: Number(recipe.protein) * quantity,
      carbs: Number(recipe.carbs) * quantity,
      fat: Number(recipe.fat) * quantity,
    },
  });
  refresh();
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
      date: todayDateOnly(),
      meal: mealOf(formData),
      foodId: food.id,
      quantity,
      calories: Math.round(food.calories * quantity),
      protein: Number(food.protein) * quantity,
      carbs: Number(food.carbs) * quantity,
      fat: Number(food.fat) * quantity,
    },
  });
  refresh();
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
  if (photo instanceof File && photo.size > 0 && !isAllowedMealPhoto(photo)) {
    const path = mealPhotoPath(user.id, photo.name);
    const err = await uploadMealPhoto(path, photo);
    if (!err) photoPath = path;
  }

  await prisma.nutritionLog.create({
    data: {
      clientId: user.id,
      date: todayDateOnly(),
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
  refresh();
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
  refresh();
}
