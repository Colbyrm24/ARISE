'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function logMeal(formData: FormData) {
  const user = await requireClient();
  const recipeId = formData.get('recipeId') as string | null;
  const meal = (formData.get('meal') as string | null) || null;
  const quantityRaw = formData.get('quantity') as string | null;
  const quantity = quantityRaw ? Number(quantityRaw) : 1;
  if (!recipeId || !Number.isFinite(quantity) || quantity <= 0) return;
  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) return;
  await prisma.nutritionLog.create({
    data: {
      clientId: user.id, date: todayDateOnly(), meal, recipeId: recipe.id, quantity,
      calories: Math.round(recipe.calories * quantity),
      protein: Number(recipe.protein) * quantity,
      carbs: Number(recipe.carbs) * quantity,
      fat: Number(recipe.fat) * quantity,
    },
  });
  revalidatePath('/nutrition');
  revalidatePath('/today');
}

export async function removeMealLog(formData: FormData) {
  const user = await requireClient();
  const logId = formData.get('logId') as string | null;
  if (!logId) return;
  const log = await prisma.nutritionLog.findUnique({ where: { id: logId } });
  if (!log || log.clientId !== user.id) return;
  await prisma.nutritionLog.delete({ where: { id: logId } });
  revalidatePath('/nutrition');
  revalidatePath('/today');
}
