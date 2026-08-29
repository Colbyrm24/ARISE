/*
  What a client's day of eating actually looks like, with no React in it.

  The nutrition screen had every number on it at the same size. Four progress
  bars, then a list of what was logged with four macros per line, then the
  plan with four macros per line, then a food library with four macros per
  line, then a quick-add form with four inputs — and none of it said which
  number mattered. Somebody opening it at 2pm to answer "am I okay, and what
  do I eat next" had to assemble that answer themselves out of about sixty
  figures.

  So the shape moved here. One question at a time:

    - how much room is left today            -> headline()
    - what does each meal look like          -> daySections()
    - is a planned line already eaten        -> loggedNameSet()

  Calories lead because calories are the thing a day is won or lost on.
  Protein is second because it's the one number this coach actually chases.
  Carbs and fat are real and are kept, but they are not the headline, and the
  page renders them accordingly.
*/

/*
  The vocabulary of a day, kept here rather than in @/lib/meal-plans, because
  that module pulls in the Prisma client the instant it is imported and this
  one has to stay runnable in a bare node test.
*/
export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export function isMealSlot(value: string): value is MealSlot {
  return (MEAL_SLOTS as readonly string[]).includes(value);
}

/** A line the coach put on the plan. */
export type PlanItem = {
  id: string;
  meal: MealSlot;
  name: string;
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  note: string | null;
  recipeId: string | null;
};

/** One thing the client actually ate, flattened out of the database row. */
export type LoggedEntry = {
  id: string;
  meal: string | null;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  photoPath: string | null;
  reviewState: string | null;
};

export type DaySection = {
  slot: MealSlot;
  /** The options the coach wrote for this meal. Pick one, not eat all. */
  planned: PlanItem[];
  /** Lines the client logged against it. */
  logged: LoggedEntry[];
  /** Eaten, from the logs. This is the real number. */
  calories: number;
  protein: number;
  /** Cheapest to dearest option, for a meal nobody has eaten yet. */
  plannedCalories: Range;
};

/*
  A plan line is a CHOICE, not a course.

  A plan holds one day, and a coach writes several options under each meal —
  seven breakfasts to pick from, not seven breakfasts to eat. Adding them up
  was the bug behind a client's screen reading "18,485 cal" and the coach's
  card announcing the day was "16,285 calories over target", which is the kind
  of number that makes somebody close the app.

  So a meal is a range: the smallest option to the largest. A day is the sum
  of those ranges, which is what one pick per meal can actually come to.
*/
export type Range = { min: number; max: number };

/** Empty comes back as 0–0 so a meal with no lines contributes nothing. */
export function rangeOf(values: number[]): Range {
  if (values.length === 0) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function addRanges(a: Range, b: Range): Range {
  return { min: a.min + b.min, max: a.max + b.max };
}

/** "2,430–2,700" — or just "2,600" when every option agrees. */
export function formatRange(r: Range) {
  const lo = Math.round(r.min).toLocaleString('en-US');
  const hi = Math.round(r.max).toLocaleString('en-US');
  return lo === hi ? lo : `${lo}–${hi}`;
}

/** What one pick per meal comes to, across the whole day. */
export function dayRange(
  bySlot: { items: { calories: number; protein: number; carbs: number; fat: number }[] }[]
) {
  const zero: Range = { min: 0, max: 0 };
  const pick = (get: (i: { calories: number; protein: number; carbs: number; fat: number }) => number) =>
    bySlot.reduce((acc, g) => addRanges(acc, rangeOf(g.items.map(get))), zero);

  return {
    calories: pick((i) => i.calories),
    protein: pick((i) => i.protein),
    carbs: pick((i) => i.carbs),
    fat: pick((i) => i.fat),
  };
}

/**
 * Whether a target is reachable from the options on the plan.
 *
 * The useful question is no longer "what does this day add up to" — it adds
 * up to nothing in particular until somebody chooses. It's "can they hit
 * their number with what's written here": if the target sits inside the
 * range, some combination lands it. If even the largest combination falls
 * short, every choice on the plan is under, and that is a stall the coach
 * should see before the client does.
 */
export function rangeVerdict(
  range: Range,
  target: number,
  tolerance: number
): { kind: 'covers' } | { kind: 'under'; by: number } | { kind: 'over'; by: number } {
  if (range.max < target - tolerance) return { kind: 'under', by: Math.round(target - range.max) };
  if (range.min > target + tolerance) return { kind: 'over', by: Math.round(range.min - target) };
  return { kind: 'covers' };
}

/**
 * Which meal a row belongs under.
 *
 * Quick-add defaults to `snack` and the photo logger can come back with
 * nothing at all, so an unslotted entry lands in Snack rather than vanishing
 * from a screen whose whole job is to add up.
 */
export function slotOf(meal: string | null | undefined): MealSlot {
  return meal && isMealSlot(meal) ? meal : 'snack';
}

/**
 * The one number at the top.
 *
 * "1,240 left" and "240 over" are the two things worth saying, and which one
 * you're looking at is the difference between eating dinner and not. A
 * percentage answers neither.
 *
 * With no target set there is nothing to be left of, so this returns the
 * amount eaten and says so — the page shows a plain total instead of a
 * countdown rather than pretending a goal exists.
 */
export function headline(eaten: number, goal: number | null | undefined) {
  if (!goal || goal <= 0) return { kind: 'untargeted' as const, amount: Math.round(eaten) };
  const diff = Math.round(goal - eaten);
  return diff >= 0
    ? { kind: 'left' as const, amount: diff }
    : { kind: 'over' as const, amount: -diff };
}

/** Bar fill, clamped. A 4,000-calorie day can't draw past the end of the bar. */
export function fillPercent(eaten: number, goal: number | null | undefined) {
  if (!goal || goal <= 0) return 0;
  return Math.max(0, Math.min(100, (eaten / goal) * 100));
}

/**
 * Names already eaten today, lower-cased.
 *
 * Matched on name rather than id on purpose: a client who logs "Chicken and
 * rice" from the photo logger instead of tapping it on the plan has still
 * eaten the planned meal, and the plan should tick it off either way.
 */
export function loggedNameSet(logs: { name: string }[]) {
  return new Set(logs.map((l) => l.name.trim().toLowerCase()).filter(Boolean));
}

/**
 * The day, meal by meal.
 *
 * Plan and logs were two separate lists before — "what you should eat" in one
 * card and "what you ate" in another — which left the client doing the join
 * in their head, twice a meal. Here Breakfast is one heading with both under
 * it, and a meal that is neither planned nor eaten simply isn't drawn.
 *
 * Slots come back in eating order, never insertion order, because a day that
 * lists dinner above breakfast reads as a bug.
 */
export function daySections(plan: PlanItem[], logs: LoggedEntry[]): DaySection[] {
  return MEAL_SLOTS.map((slot) => {
    const planned = plan.filter((i) => i.meal === slot);
    const logged = logs.filter((l) => slotOf(l.meal) === slot);
    return {
      slot,
      planned,
      logged,
      calories: logged.reduce((s, l) => s + l.calories, 0),
      protein: Math.round(logged.reduce((s, l) => s + l.protein, 0)),
      plannedCalories: rangeOf(planned.map((i) => i.calories)),
    };
  }).filter((s) => s.planned.length > 0 || s.logged.length > 0);
}

/** Totals across everything logged, in one pass rather than four reduces. */
export function eatenTotals(logs: LoggedEntry[]) {
  return logs.reduce(
    (acc, l) => ({
      calories: acc.calories + l.calories,
      protein: acc.protein + l.protein,
      carbs: acc.carbs + l.carbs,
      fat: acc.fat + l.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}
