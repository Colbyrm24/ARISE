/*
  Daily habits.

  The Today screen has always rendered these. What was missing was every way
  of putting one there — DailyGoal, DailyGoalLog and StepLog were read and
  never written, so the first thing a client saw on opening the app was "your
  coach hasn't set your daily goals yet", permanently, no matter what the
  coach did. This module is the shared vocabulary that the coach editor, the
  client's tick and the Today screen all agree on.

  The split that matters is tracked versus manual. A tracked habit already has
  a number somewhere in the app — steps, protein, calories, the workout — and
  ticking it by hand would let a client mark protein done on a day they ate
  40g. Those complete themselves off the real number. Manual habits are the
  ones nothing else can know about: water, sleep, sunlight, no alcohol. Those
  are the only ones with a checkbox.
*/

export type HabitType =
  | 'workout'
  | 'steps'
  | 'protein'
  | 'calories'
  | 'water'
  | 'sleep'
  | 'photo'
  | 'custom';

export const HABIT_TYPES: HabitType[] = [
  'workout',
  'steps',
  'protein',
  'calories',
  'water',
  'sleep',
  'photo',
  'custom',
];

/** Habits the app can measure on its own. These are never hand-ticked. */
export const TRACKED: ReadonlySet<HabitType> = new Set<HabitType>([
  'workout',
  'steps',
  'protein',
  'calories',
]);

export function isTracked(type: string) {
  return TRACKED.has(type as HabitType);
}

type HabitMeta = {
  label: string;
  /** Placeholder for the coach's target field, or null when it takes none. */
  targetHint: string | null;
  unit: string;
};

export const HABIT_META: Record<HabitType, HabitMeta> = {
  workout: { label: 'Train', targetHint: null, unit: '' },
  steps: { label: 'Steps', targetHint: '10000', unit: '' },
  protein: { label: 'Protein', targetHint: 'from target', unit: 'g' },
  calories: { label: 'Calories', targetHint: 'from target', unit: '' },
  water: { label: 'Water', targetHint: '1 gallon', unit: '' },
  sleep: { label: 'Sleep', targetHint: '7 hours', unit: '' },
  photo: { label: 'Progress photo', targetHint: null, unit: '' },
  custom: { label: 'Habit', targetHint: 'what to do', unit: '' },
};

/**
 * What a habit row is called on screen.
 *
 * A custom habit's target field holds its whole description — "no alcohol",
 * "10 min stretch" — so for that one the target IS the label. Everything else
 * has a fixed name and uses the target as a number.
 */
export function habitLabel(type: string, targetValue: string | null) {
  if (type === 'custom') return targetValue?.trim() || 'Habit';
  return HABIT_META[type as HabitType]?.label ?? targetValue?.trim() ?? 'Habit';
}

export function isHabitType(value: string): value is HabitType {
  return (HABIT_TYPES as string[]).includes(value);
}

/**
 * The number inside a coach's free-text target.
 *
 * `targetValue` is a text column because a custom habit's target is its whole
 * description, so every numeric habit has to dig its number back out of prose:
 * "12,000 steps", "180g protein", "10k".
 *
 * That last one was silently wrong. Stripping every non-digit turned "10k"
 * into 10 — a ten-step daily goal that the client cleared before getting out
 * of bed and that read as landed all day. `10k` is how people actually write
 * a step target, so it has to mean ten thousand.
 */
export function parseTarget(raw: unknown): number | undefined {
  if (raw === null || raw === undefined) return undefined;
  const text = String(raw).trim().toLowerCase().replace(/,/g, '');
  if (!text) return undefined;

  const shorthand = /^(\d+(?:\.\d+)?)\s*k\b/.exec(text);
  if (shorthand) {
    const n = Number(shorthand[1]) * 1000;
    return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
  }

  const n = Number(text.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Streak length in days, counting back from today.
 *
 * Today not being done yet does not break a streak — it's only mid-afternoon
 * as far as this function knows, and showing someone a broken streak at 2pm
 * for a habit they'll do at 8pm is the fastest way to make them stop looking.
 * Yesterday missing does break it.
 */
export function streakFrom(doneDates: Set<string>, today: Date): number {
  /*
    `today` must already be the client's calendar day — todayFor(user) — and
    is stepped in UTC from there.

    Two things this gets right that the old version didn't. It no longer
    applies server-local midnight, which on a UTC host meant a client's
    streak broke and healed five hours early. And stepping by whole UTC dates
    rather than subtracting 86,400,000ms means the twice-yearly 23- and
    25-hour local days can't skip a date or visit one twice — either of which
    silently ends a streak somebody actually kept.
  */
  const key = (d: Date) => d.toISOString().slice(0, 10);
  const back = (d: Date, n: number) =>
    new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - n));

  let streak = 0;
  let n = 0;

  // Today not being done yet is not a miss; it may only be mid-afternoon.
  if (doneDates.has(key(today))) streak += 1;
  n += 1;

  while (doneDates.has(key(back(today, n)))) {
    streak += 1;
    n += 1;
  }
  return streak;
}

/**
 * The goal to print on a habit row when the number can't carry it.
 *
 * A tracked habit shows its goal inside the readout — "[7400/12000]" — so it
 * needs nothing here. A manual one had nowhere to put it at all: habitLabel
 * throws targetValue away for every type except custom, and the row's readout
 * is a bare "[—]" because there is no measured value to show. So a coach who
 * set Water to "1 gallon" produced a row reading "Water [—]", and the client
 * never saw the gallon. The instruction existed in the database and on the
 * coach's screen and nowhere the client could read it.
 *
 * Returns null when the row already says it — a numeric total is in the
 * readout, and a custom habit's target IS its label.
 */
export function habitGoalText(
  type: string,
  targetValue: string | null | undefined,
  total: number | undefined
): string | null {
  if (total !== undefined) return null;
  // A custom habit's target is its whole description, already used as the
  // label. Printing it twice would read "no alcohol — no alcohol".
  if (type === 'custom') return null;
  const text = (targetValue ?? '').trim();
  return text || null;
}
