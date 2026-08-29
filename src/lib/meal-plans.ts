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

  And the lines under a meal are OPTIONS. Seven breakfasts on a plan means
  seven things you could have, one of which you will. Everything here that
  used to add a plan up — and the two screens that printed the result — was
  quietly answering the wrong question; see the note on Range in
  @/lib/nutrition-day for what that looked like on a real client.
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
  type Range,
} from '@/lib/nutrition-day';

import {
  MEAL_SLOTS,
  isMealSlot,
  dayRange,
  rangeOf,
  rangeVerdict,
  type MealSlot,
  type PlanItem,
  type Range,
} from '@/lib/nutrition-day';

/** What one pick per meal comes to. Not a sum — see the file header. */
export type PlanDayRange = {
  calories: Range;
  protein: Range;
  carbs: Range;
  fat: Range;
};

export type ClientPlan = {
  id: string;
  name: string;
  note: string | null;
  createdAt: Date;
  /** Grouped in eating order, not insertion order. Items are the options. */
  bySlot: { slot: MealSlot; items: PlanItem[]; calories: Range; protein: Range }[];
  items: PlanItem[];
  dayRange: PlanDayRange;
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

/** The client's current plan, or null when their coach hasn't written one. */
export async function getActivePlan(clientId: string): Promise<ClientPlan | null> {
  const plan = await prisma.mealPlan.findFirst({
    where: { clientId, active: true },
    orderBy: { createdAt: 'desc' },
    include: { items: { orderBy: [{ position: 'asc' }] } },
  });
  if (!plan) return null;

  const items = plan.items.map(toItem);

  // Slots in the order somebody eats them, and empty ones dropped — an
  // empty "Snack" heading is a row of nothing that pushes dinner off screen.
  const bySlot = MEAL_SLOTS.map((slot) => {
    const slotItems = items.filter((i) => i.meal === slot);
    return {
      slot,
      items: slotItems,
      calories: rangeOf(slotItems.map((i) => i.calories)),
      protein: rangeOf(slotItems.map((i) => i.protein)),
    };
  }).filter((g) => g.items.length > 0);

  return {
    id: plan.id,
    name: plan.name,
    note: plan.note,
    createdAt: plan.createdAt,
    items,
    bySlot,
    dayRange: dayRange(bySlot),
  };
}

/**
 * Whether the client can hit their target with what's written on the plan.
 *
 * This is the check a coach can't do in their head, and it's where plans
 * quietly go wrong — every option on the plan comes to 2,850 against a 3,200
 * target and the client stalls for a month without anybody knowing why.
 *
 * It asks whether the target is REACHABLE, not what the plan sums to. Summing
 * it was the old behaviour and it produced "16,285 calories over" on a plan
 * with seven breakfasts, which is both alarming and meaningless.
 *
 * Returns null when there's no target to compare against, rather than
 * inventing one.
 */
export async function planVsTarget(clientId: string, range: PlanDayRange) {
  const target = await prisma.nutritionTarget.findFirst({
    where: { clientId },
    orderBy: { effectiveDate: 'desc' },
  });
  if (!target) return null;

  const proteinTarget = Math.round(Number(target.protein));

  return {
    target: {
      calories: target.calories,
      protein: proteinTarget,
      carbs: Math.round(Number(target.carbs)),
      fat: Math.round(Number(target.fat)),
    },
    // A day within 100 calories of target is on the money; the client's own
    // portioning moves it further than that anyway, so flagging a 40-calorie
    // gap would train the coach to ignore the flag.
    calories: rangeVerdict(range.calories, target.calories, 100),
    protein: rangeVerdict(range.protein, proteinTarget, 15),
  };
}
