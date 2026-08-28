import { prisma } from '@/lib/prisma';

/*
  Meal plans.

  The nutrition screen used to open on a search box, which is only useful to
  somebody who already knows what they should be eating — and if they knew
  that, they wouldn't be paying for coaching. Meanwhile the coach was telling
  people what to eat over text all day and it lived nowhere.

  A plan is a day, not a week. Coaches here work in repeatable days with
  swaps, not seven distinct menus, and a seven-day plan is mostly a way to
  make somebody feel behind by Wednesday.
*/

/*
  The slots and the shape of a plan line live in @/lib/nutrition-day, which
  imports no database at all. This file does — the moment it is imported, so
  is the Prisma client — so anything that wants only the vocabulary can take
  it from there and stay testable. Re-exported here because every existing
  caller already reaches for it at this address.
*/
export {
  MEAL_SLOTS,
  isMealSlot,
  type MealSlot,
  type PlanItem,
} from '@/lib/nutrition-day';

import { MEAL_SLOTS, isMealSlot, type MealSlot, type PlanItem } from '@/lib/nutrition-day';

export type PlanTotals = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type ClientPlan = {
  id: string;
  name: string;
  note: string | null;
  createdAt: Date;
  /** Grouped in eating order, not insertion order. */
  bySlot: { slot: MealSlot; items: PlanItem[]; calories: number; protein: number }[];
  items: PlanItem[];
  totals: PlanTotals;
};

function toItem(row: {
  id: string;
  meal: string;
  name: string;
  quantity: unknown;
  calories: number;
  protein: unknown;
  carbs: unknown;
  fat: unknown;
  note: string | null;
  recipeId: string | null;
}): PlanItem {
  return {
    id: row.id,
    meal: isMealSlot(row.meal) ? row.meal : 'snack',
    name: row.name,
    quantity: Number(row.quantity),
    calories: row.calories,
    protein: Math.round(Number(row.protein)),
    carbs: Math.round(Number(row.carbs)),
    fat: Math.round(Number(row.fat)),
    note: row.note,
    recipeId: row.recipeId,
  };
}

export function totalsOf(items: PlanItem[]): PlanTotals {
  return {
    calories: items.reduce((s, i) => s + i.calories, 0),
    protein: items.reduce((s, i) => s + i.protein, 0),
    carbs: items.reduce((s, i) => s + i.carbs, 0),
    fat: items.reduce((s, i) => s + i.fat, 0),
  };
}

/** The client's current plan, or null when their coach hasn't written one. */
export async function getActivePlan(clientId: string): Promise<ClientPlan | null> {
  const plan = await prisma.mealPlan.findFirst({
    where: { clientId, active: true },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: [{ position: 'asc' }] } },
  });
  if (!plan) return null;

  const items = plan.items.map(toItem);

  return {
    id: plan.id,
    name: plan.name,
    note: plan.note,
    createdAt: plan.createdAt,
    items,
    totals: totalsOf(items),
    // Slots in the order somebody eats them, and empty ones dropped — an
    // empty "Snack" heading is a row of nothing that pushes dinner off screen.
    bySlot: MEAL_SLOTS.map((slot) => {
      const slotItems = items.filter((i) => i.meal === slot);
      return {
        slot,
        items: slotItems,
        calories: slotItems.reduce((s, i) => s + i.calories, 0),
        protein: slotItems.reduce((s, i) => s + i.protein, 0),
      };
    }).filter((g) => g.items.length > 0),
  };
}

/**
 * How a plan compares to the target it's meant to hit.
 *
 * This is the check a coach can't do in their head across six lines, and it's
 * where plans quietly go wrong — a day that reads sensible meal by meal comes
 * to 2,850 against a 3,200 target and the client stalls for a month without
 * anybody knowing why.
 *
 * Returns null when there's no target to compare against, rather than
 * inventing one.
 */
export async function planVsTarget(clientId: string, totals: PlanTotals) {
  const target = await prisma.nutritionTarget.findFirst({
    where: { clientId },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!target) return null;

  const calorieGap = totals.calories - target.calories;
  const proteinGap = totals.protein - Math.round(Number(target.protein));

  return {
    target: {
      calories: target.calories,
      protein: Math.round(Number(target.protein)),
      carbs: Math.round(Number(target.carbs)),
      fat: Math.round(Number(target.fat)),
    },
    calorieGap,
    proteinGap,
    // A day within 100 calories of target is on the money; the client's own
    // portioning moves it further than that anyway, so flagging a 40-calorie
    // gap would train the coach to ignore the flag.
    calorieOff: Math.abs(calorieGap) > 100,
    proteinOff: Math.abs(proteinGap) > 15,
  };
}
