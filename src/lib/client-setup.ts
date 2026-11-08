import { prisma } from '@/lib/prisma';
import { todayFor } from '@/lib/day';
import { resizeLine, scaleFactor, typicalDay } from '@/lib/plan-scale';

/*
  The pieces of setting a client up, shared by the one-screen setup and the
  individual buttons on the Meals tab.

  None of these check who is asking. Every caller is a server action that has
  already confirmed the coach owns the client(s) involved — keep it that way,
  and keep this out of any 'use server' file, where every export becomes
  callable from a browser.
*/

export type Target = { calories: number; protein: number; carbs: number; fat: number };

/**
 * Their calorie and macro target, effective on the CLIENT's today.
 * Upserted so correcting a number just typed replaces it (see
 * nutrition-actions for why two rows on one day went wrong).
 */
export async function writeTarget(clientId: string, t: Target) {
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });
  const effectiveDate = todayFor(client);
  await prisma.nutritionTarget.upsert({
    where: { clientId_effectiveDate: { clientId, effectiveDate } },
    create: { clientId, ...t, effectiveDate },
    update: t,
  });
}

/** Today's calorie target, or null when none has been set. */
export async function currentCalories(clientId: string): Promise<number | null> {
  const t = await prisma.nutritionTarget.findFirst({
    where: { clientId },
    orderBy: { effectiveDate: 'desc' },
    select: { calories: true },
  });
  return t?.calories ?? null;
}

type Row = {
  meal: string;
  position: number;
  recipeId: string | null;
  foodId: string | null;
  name: string;
  quantity: unknown;
  calories: number;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
  note: string | null;
};

function resized(row: Row, factor: number) {
  const r = resizeLine(
    {
      quantity: Number(row.quantity),
      calories: row.calories,
      protein: Number(row.protein),
      carbs: Number(row.carbs),
      fat: Number(row.fat),
    },
    factor
  );
  return {
    meal: row.meal,
    position: row.position,
    recipeId: row.recipeId,
    foodId: row.foodId,
    name: row.name,
    note: row.note,
    ...r,
  };
}

/**
 * Copies another client's current plan onto this one, resized to this
 * client's calories. Build a plan properly once, then reuse it for everyone
 * it suits — that is the whole point of this.
 *
 * Returns null when the source has no plan.
 */
export async function copyPlan(coachId: string, fromClientId: string, toClientId: string) {
  const source = await prisma.mealPlan.findFirst({
    where: { clientId: fromClientId, active: true },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: { position: 'asc' } } },
  });
  if (!source || source.items.length === 0) return null;

  const factor = scaleFactor(await currentCalories(toClientId), typicalDay(source.items));
  const lines = source.items.map((i) => resized(i, factor));

  await prisma.mealPlan.updateMany({ where: { clientId: toClientId, active: true }, data: { active: false } });
  const plan = await prisma.mealPlan.create({
    data: { clientId: toClientId, coachId, name: source.name, note: source.note, active: true },
  });
  await prisma.mealPlanItem.createMany({ data: lines.map((l) => ({ planId: plan.id, ...l })) });

  return { planId: plan.id, name: source.name, factor, day: typicalDay(lines) };
}

/**
 * Resizes the client's current plan to their current calories, in place.
 * The button to press after changing someone's target.
 */
export async function resizeActivePlan(clientId: string) {
  const plan = await prisma.mealPlan.findFirst({
    where: { clientId, active: true },
    orderBy: { createdAt: 'desc' },
    include: { items: true },
  });
  if (!plan || plan.items.length === 0) return null;

  const factor = scaleFactor(await currentCalories(clientId), typicalDay(plan.items));
  if (factor === 1) return { factor, day: typicalDay(plan.items) };

  const lines = plan.items.map((i) => ({ id: i.id, ...resized(i, factor) }));
  await prisma.$transaction(
    lines.map((l) =>
      prisma.mealPlanItem.update({
        where: { id: l.id },
        data: { quantity: l.quantity, calories: l.calories, protein: l.protein, carbs: l.carbs, fat: l.fat },
      })
    )
  );
  return { factor, day: typicalDay(lines) };
}

/**
 * Other clients of this coach who have a plan worth copying, newest first.
 * One per client, labelled with their name and the plan's.
 */
export async function copySourcesFor(coachId: string, excludeClientId: string) {
  const plans = await prisma.mealPlan.findMany({
    where: {
      active: true,
      clientId: { not: excludeClientId },
      OR: [{ coachId }, { client: { coachId } }],
      items: { some: {} },
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
    select: {
      clientId: true,
      name: true,
      client: { select: { user: { select: { email: true, profile: { select: { fullName: true } } } } } },
    },
  });
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const p of plans) {
    if (seen.has(p.clientId)) continue;
    seen.add(p.clientId);
    const who = p.client.user.profile?.fullName || p.client.user.email;
    out.push({ id: p.clientId, name: `${who} — ${p.name}` });
  }
  return out;
}
