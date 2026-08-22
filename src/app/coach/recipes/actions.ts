'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { seedRecipeLibrary } from '@/lib/recipe-seed';

function splitList(value: FormDataEntryValue | null): string[] {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

/** Adds a recipe to the shared meal library. */
export async function createRecipe(formData: FormData) {
  const user = await requireCoach();

  const title = (formData.get('title') as string | null)?.trim();
  const calories = Number(formData.get('calories'));
  const protein = Number(formData.get('protein'));
  const carbs = Number(formData.get('carbs'));
  const fat = Number(formData.get('fat'));
  if (!title || !Number.isFinite(calories) || !Number.isFinite(protein) || !Number.isFinite(carbs) || !Number.isFinite(fat)) {
    return;
  }

  const servingSize = (formData.get('servingSize') as string | null)?.trim() || null;
  const instructions = (formData.get('instructions') as string | null)?.trim() || '';
  const prepTimeRaw = formData.get('prepTime') as string | null;
  const cookTimeRaw = formData.get('cookTime') as string | null;
  const prepTime = prepTimeRaw ? Number(prepTimeRaw) : null;
  const cookTime = cookTimeRaw ? Number(cookTimeRaw) : null;
  const tags = splitList(formData.get('tags'));
  const ingredients = splitList(formData.get('ingredients'));

  await prisma.recipe.create({
    data: {
      coachId: user.id,
      title,
      calories,
      protein,
      carbs,
      fat,
      servingSize,
      instructions,
      prepTime,
      cookTime,
      tags,
      ingredientsJson: ingredients,
    },
  });

  revalidatePath('/coach/recipes');
}

/** Removes a recipe from the library. No-ops if it's already been logged by a client. */
export async function deleteRecipe(formData: FormData) {
  await requireCoach();
  const recipeId = formData.get('recipeId') as string | null;
  if (!recipeId) return;

  try {
    await prisma.recipe.delete({ where: { id: recipeId } });
  } catch {
    // referenced by existing nutrition logs — leave it in place
  }

  revalidatePath('/coach/recipes');
}

/**
 * Puts the twenty-one meal library into the database.
 *
 * Idempotent by title, so pressing it twice adds nothing and a recipe the
 * coach has since edited is left alone.
 */
export async function loadRecipeLibrary() {
  const coach = await requireCoach();
  await seedRecipeLibrary(coach.id);
  revalidatePath('/coach/recipes');
}
