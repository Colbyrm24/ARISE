'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { isMealSlot } from '@/lib/meal-plans';
import { notify } from '@/lib/notifications';

/*
  Writing a client's meal plan.

  Lines carry their own macros rather than reading them through recipeId at
  display time. A recipe edited in November must not silently rewrite what
  somebody was told to eat in September, and a plan line has to keep working
  when the recipe behind it is deleted.
*/

function refresh(clientId: string) {
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath('/nutrition');
  revalidatePath('/today');
}

/** Creates the plan if there isn't one, so adding the first line just works. */
async function activePlanFor(clientId: string, coachId: string) {
  const existing = await prisma.mealPlan.findFirst({
    where: { clientId, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.mealPlan.create({
    data: { clientId, coachId, name: 'Daily plan', active: true },
  });
}

export async function addPlanItem(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const meal = ((formData.get('meal') as string | null) ?? '').trim();
  if (!clientId || !isMealSlot(meal)) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  const recipeId = ((formData.get('recipeId') as string | null) ?? '').trim() || null;
  const foodId = ((formData.get('foodId') as string | null) ?? '').trim() || null;

  const rawQty = Number((formData.get('quantity') as string | null) ?? 1);
  const quantity = Number.isFinite(rawQty) && rawQty > 0 ? Math.min(rawQty, 20) : 1;
  const note = ((formData.get('note') as string | null) ?? '').trim().slice(0, 200) || null;

  let name = ((formData.get('name') as string | null) ?? '').trim().slice(0, 120);
  let calories = Number(formData.get('calories'));
  let protein = Number(formData.get('protein') ?? 0);
  let carbs = Number(formData.get('carbs') ?? 0);
  let fat = Number(formData.get('fat') ?? 0);

  // A line built from the library takes its numbers from the library, so the
  // coach doesn't retype macros he already entered once.
  if (recipeId) {
    const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
    if (!recipe) return;
    name = name || recipe.title;
    calories = recipe.calories * quantity;
    protein = Number(recipe.protein) * quantity;
    carbs = Number(recipe.carbs) * quantity;
    fat = Number(recipe.fat) * quantity;
  } else if (foodId) {
    const food = await prisma.food.findUnique({ where: { id: foodId } });
    if (!food) return;
    name = name || food.name;
    calories = food.calories * quantity;
    protein = Number(food.protein) * quantity;
    carbs = Number(food.carbs) * quantity;
    fat = Number(food.fat) * quantity;
  }

  if (!name) return;
  if (![calories, protein, carbs, fat].every((n) => Number.isFinite(n) && n >= 0)) return;
  if (calories > 10000) return;

  const plan = await activePlanFor(clientId, coach.id);
  const last = await prisma.mealPlanItem.findFirst({
    where: { planId: plan.id },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  await prisma.mealPlanItem.create({
    data: {
      planId: plan.id,
      meal,
      position: (last?.position ?? -1) + 1,
      recipeId,
      foodId,
      name,
      quantity,
      calories: Math.round(calories),
      protein,
      carbs,
      fat,
      note,
    },
  });

  refresh(clientId);
}

export async function removePlanItem(formData: FormData) {
  const coach = await requireCoach();
  const itemId = formData.get('itemId') as string | null;
  if (!itemId) return;

  const item = await prisma.mealPlanItem.findUnique({
    where: { id: itemId },
    include: { plan: { select: { clientId: true } } },
  });
  if (!item) return;
  if (!(await coachOwnsClient(coach.id, item.plan.clientId))) return;

  await prisma.mealPlanItem.delete({ where: { id: itemId } });
  refresh(item.plan.clientId);
}

/** Renames the plan, or leaves the client a note about how to run it. */
export async function updatePlan(formData: FormData) {
  const coach = await requireCoach();
  const planId = formData.get('planId') as string | null;
  if (!planId) return;

  const plan = await prisma.mealPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  if (!(await coachOwnsClient(coach.id, plan.clientId))) return;

  const name = ((formData.get('name') as string | null) ?? '').trim().slice(0, 80);
  const note = ((formData.get('note') as string | null) ?? '').trim().slice(0, 400);

  await prisma.mealPlan.update({
    where: { id: planId },
    data: { name: name || plan.name, note: note || null },
  });
  refresh(plan.clientId);
}

/**
 * Publishes the plan to the client.
 *
 * A plan being written and a plan being handed over are different moments —
 * without this the client would watch it appear line by line and get a push
 * for a half-built day. This is the point at which they're told.
 */
export async function publishPlan(formData: FormData) {
  const coach = await requireCoach();
  const planId = formData.get('planId') as string | null;
  if (!planId) return;

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    include: { _count: { select: { items: true } } },
  });
  if (!plan || plan._count.items === 0) return;
  if (!(await coachOwnsClient(coach.id, plan.clientId))) return;

  await notify(plan.clientId, 'nutrition', `Your coach set up "${plan.name}".`);
  refresh(plan.clientId);
}

/**
 * Retires the current plan.
 *
 * Deactivated, not deleted. What somebody was asked to eat during the weeks a
 * change actually happened is the useful record, and it's gone the moment
 * this becomes a DELETE.
 */
export async function retirePlan(formData: FormData) {
  const coach = await requireCoach();
  const planId = formData.get('planId') as string | null;
  if (!planId) return;

  const plan = await prisma.mealPlan.findUnique({ where: { id: planId } });
  if (!plan) return;
  if (!(await coachOwnsClient(coach.id, plan.clientId))) return;

  await prisma.mealPlan.update({ where: { id: planId }, data: { active: false } });
  refresh(plan.clientId);
}
