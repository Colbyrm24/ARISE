/*
  Fitting a meal plan to a person.

  The standard plan was one size: ~2,600 calories whoever it went to. A 180lb
  guy cutting on 2,000 and a 230lb guy on 3,200 got the same plates, and the
  coach either retyped every line by hand or told them over text to "eat a bit
  less of everything" — which lives nowhere and is forgotten by Thursday.

  So a plan is resized by servings, in quarters. "1¼ servings" is something a
  person can actually do with a recipe; 1.137 is not. Macros move with the
  servings, so the numbers on the plan stay true to what's on the plate.

  No database here, so it is testable on its own.
*/

export const MIN_FACTOR = 0.5;
export const MAX_FACTOR = 3;

/** Rounded to the nearest quarter. */
export function quarter(n: number): number {
  return Math.round(n * 4) / 4;
}

/**
 * How much to multiply a plan by to move it from `base` calories to `target`.
 * 1 when either side is missing — leave a plan alone rather than guess.
 */
export function scaleFactor(target: number | null | undefined, base: number | null | undefined): number {
  if (!target || !base || !Number.isFinite(target) || !Number.isFinite(base) || target <= 0 || base <= 0) {
    return 1;
  }
  return Math.min(MAX_FACTOR, Math.max(MIN_FACTOR, quarter(target / base)));
}

export type PlanLine = {
  quantity: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

const oneDp = (n: number) => Math.round(n * 10) / 10;

/**
 * One plan line, resized. Servings land on a quarter (never under ¼), and the
 * macros follow the servings that were actually written down rather than the
 * raw factor, so a rounded quantity and its calories always agree.
 */
export function resizeLine(line: PlanLine, factor: number): PlanLine {
  const from = line.quantity > 0 ? line.quantity : 1;
  const quantity = Math.min(20, Math.max(0.25, quarter(from * factor)));
  const ratio = quantity / from;
  return {
    quantity,
    calories: Math.round(line.calories * ratio),
    protein: oneDp(line.protein * ratio),
    carbs: oneDp(line.carbs * ratio),
    fat: oneDp(line.fat * ratio),
  };
}

/**
 * What one pick per meal comes to, in the middle: the average option for each
 * meal, added up. That's the number to scale from — a plan's options aren't
 * a sum (see @/lib/meal-plans), and its cheapest or dearest day isn't typical.
 */
export function typicalDay(lines: { meal: string; calories: number }[]): number {
  const byMeal = new Map<string, number[]>();
  for (const l of lines) byMeal.set(l.meal, [...(byMeal.get(l.meal) ?? []), l.calories]);
  let total = 0;
  for (const cals of byMeal.values()) total += cals.reduce((a, b) => a + b, 0) / cals.length;
  return Math.round(total);
}

const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

/** "1¼ servings", "½ serving", "2 servings" — how a client reads a quantity. */
export function servingsLabel(quantity: number): string {
  const whole = Math.floor(quantity);
  const frac = FRACTIONS[quarter(quantity - whole)] ?? '';
  const text = whole === 0 && frac ? frac : `${whole || ''}${frac}` || String(quantity);
  return `${text} ${quantity <= 1 ? 'serving' : 'servings'}`;
}
