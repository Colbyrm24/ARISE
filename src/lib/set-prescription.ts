/*
  Saying what a set actually asks for.

  The screen a client trains from rendered every set as `12 × 95 · 90s rest`
  in 11px mono, in red until it was logged. Three separate problems in one
  line: the numbers carry no units, so `12 × 95` could be twelve sets or
  twelve reps; the whole thing is the same size as a timestamp; and a column
  of red reads as a list of errors rather than a list of work.

  Worse, `WorkoutSet.type` — warmup, working, drop — was stored and displayed
  nowhere at all. Colby's own programming is two working sets plus a drop set
  on every movement, and on screen the drop set was indistinguishable from the
  others. The one distinction that changes what you do was invisible.

  No database in here on purpose: formatting is where the fiddly cases live
  (a rep target is free text, so "8-10" and "to failure" both have to come out
  right), and this way the tests can run without a generated Prisma client.
*/

export type SetType = 'warmup' | 'working' | 'drop';

/** Only what formatting needs — the page maps its rows onto this. */
export type SetShape = {
  type: SetType;
  targetReps: string | null;
  targetWeight: number | null;
  restSeconds: number | null;
};

/**
 * A rep target, with the word "reps" on it when it is a count.
 *
 * `targetReps` is text precisely so a coach can write "8-10" or "to failure",
 * so this has to tell a number from a sentence. "8-10 reps" is right;
 * "to failure reps" is not.
 */
export function repsLabel(targetReps: string | null | undefined): string | null {
  const raw = (targetReps ?? '').trim();
  if (!raw) return null;

  const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(raw);
  if (range) return `${range[1]}–${range[2]} reps`;

  if (/^\d+$/.test(raw)) return `${raw} ${raw === '1' ? 'rep' : 'reps'}`;

  // Prose target — a coach's own words, left alone.
  return raw;
}

/** Weight with its unit, and no trailing zeros pretending to be precision. */
export function weightLabel(targetWeight: number | null | undefined): string | null {
  if (targetWeight === null || targetWeight === undefined) return null;
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return null;
  const rounded = Math.round(targetWeight * 100) / 100;
  return `${rounded} lb`;
}

/**
 * Rest, in the units a person counts in.
 *
 * Ninety seconds is "90s", but three hundred is "5m" — nobody stands there
 * thinking in three-hundred seconds, and this is the number you read while
 * out of breath.
 */
export function restLabel(restSeconds: number | null | undefined): string | null {
  if (!restSeconds || !Number.isFinite(restSeconds) || restSeconds <= 0) return null;
  if (restSeconds < 120) return `${Math.round(restSeconds)}s rest`;
  const minutes = Math.floor(restSeconds / 60);
  const seconds = Math.round(restSeconds % 60);
  return seconds === 0 ? `${minutes}m rest` : `${minutes}m ${seconds}s rest`;
}

/**
 * The tag on a set that is not an ordinary working set.
 *
 * Returns null for `working` deliberately — labelling every normal set
 * "WORKING" is noise that buries the two that are different.
 */
export function setTypeLabel(type: SetType): string | null {
  if (type === 'warmup') return 'Warm-up';
  if (type === 'drop') return 'Drop set';
  return null;
}

/** The parts of one set's prescription, in reading order, blanks dropped. */
export function describeSet(set: SetShape): string[] {
  return [repsLabel(set.targetReps), weightLabel(set.targetWeight), restLabel(set.restSeconds)]
    .filter((p): p is string => Boolean(p));
}

export type Prescription = {
  working: number;
  warmup: number;
  drop: number;
  /** The rep target shared by every working set, when they agree. */
  reps: string | null;
  /** The weight shared by every working set, when they agree. */
  weight: string | null;
  /** One line for under the exercise name. */
  headline: string;
};

/**
 * What this movement asks for, in one line.
 *
 * The count of sets was previously only in a small `3` beside the exercise
 * name, and the rep target only on each row — so "how many sets of how many
 * reps", the question anyone actually asks about a movement, could only be
 * answered by reading and comparing every row.
 *
 * Reps and weight are only promoted to the headline when every working set
 * agrees. Where they differ the line stays honest about the count and lets
 * the rows carry the detail, rather than quoting the first set's numbers as
 * though they were the whole prescription.
 */
export function summarise(sets: SetShape[]): Prescription {
  const working = sets.filter((s) => s.type === 'working');
  const warmup = sets.filter((s) => s.type === 'warmup').length;
  const drop = sets.filter((s) => s.type === 'drop').length;

  const shared = <T,>(values: T[]): T | null => {
    if (values.length === 0) return null;
    const first = values[0];
    return values.every((v) => v === first) ? first : null;
  };

  // Fall back to every set when a workout has no set typed `working` at all,
  // so an unlabelled program still gets a sensible line instead of "0 sets".
  const counted = working.length > 0 ? working : sets;

  const reps = shared(counted.map((s) => repsLabel(s.targetReps)));
  const weight = shared(counted.map((s) => weightLabel(s.targetWeight)));

  const pieces: string[] = [];
  if (counted.length > 0) {
    pieces.push(`${counted.length} ${counted.length === 1 ? 'set' : 'sets'}`);
  }
  if (working.length > 0 && drop > 0) {
    pieces[0] = `${working.length} ${working.length === 1 ? 'set' : 'sets'} + ${drop} drop`;
  }
  if (warmup > 0) pieces.push(`${warmup} warm-up`);
  if (reps) pieces.push(reps);
  if (weight) pieces.push(weight);

  return {
    working: working.length,
    warmup,
    drop,
    reps,
    weight,
    headline: pieces.join(' · '),
  };
}

/*
  Reading what a client typed into a set row.

  `logSet` took the two boxes on the row and did `Number(raw)` on each, with
  no check of any kind. Three things came through that gate:

  · A fat-fingered 22555 instead of 225. actual_weight is Decimal(6,2), so
    Postgres rejects anything over 9999.99 — the server action throws, there
    is no error boundary above it, and the client mid-session loses the whole
    screen to a generic error page. The number pad on a phone makes this the
    single likeliest typo on the busiest screen in the app.
  · A negative weight, stored happily, which then makes total_volume negative
    and drags the client's whole trend down.
  · NaN, from a crafted request, straight into Prisma.

  Every other logger in this codebase — logWeight, logMeasurement, logSteps,
  logCardio — bounds its numbers. The one a client touches every single day
  was the exception.

  Kept here, pure, so the bounds are tested rather than trusted.
*/

/** The most weight worth believing, in pounds. Well under Decimal(6,2). */
export const MAX_LOGGED_WEIGHT = 2000;
/** Enough for any real set, including a long burnout. */
export const MAX_LOGGED_REPS = 200;

/**
 * What to write for one of the two boxes.
 *
 * Three outcomes, deliberately distinct:
 *
 *   `undefined` — the field was not on the form. Leave the stored value be.
 *   `null`      — the field was there and empty. The client cleared it.
 *   a number    — a value inside the bounds.
 *
 * Unreadable input is treated as `undefined` rather than `null`: a crafted or
 * corrupted field should change nothing, not wipe what is already recorded.
 *
 * The `null` case is the fix for its own small bug. `actualWeight ?? undefined`
 * meant a cleared box was indistinguishable from an absent one, so Prisma
 * skipped the field and the old number stayed — a client who noticed they had
 * typed the wrong weight, blanked the box and re-ticked the row watched the
 * wrong weight sit there with no way to remove it.
 */
export function parseLoggedNumber(
  raw: string | null | undefined,
  { max, integer }: { max: number; integer: boolean }
): number | null | undefined {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  if (n < 0 || n > max) return undefined;

  return integer ? Math.round(n) : Math.round(n * 100) / 100;
}

/** The weight box: two decimal places, capped below what the column allows. */
export function parseLoggedWeight(raw: string | null | undefined) {
  return parseLoggedNumber(raw, { max: MAX_LOGGED_WEIGHT, integer: false });
}

/** The reps box: whole reps only. */
export function parseLoggedReps(raw: string | null | undefined) {
  return parseLoggedNumber(raw, { max: MAX_LOGGED_REPS, integer: true });
}

/*
  A ceiling on how many sets one exercise can be programmed with.

  `Math.max(1, Number(formData.get('numSets')) || 3)` had a floor and no roof,
  and the input had `min="1"` and no `max`. A coach typing 30 instead of 3
  wrote thirty WorkoutSet rows, which the client then meets as thirty rows of
  two inputs and a form on the screen they use every day — and `deleteWorkoutExercise`
  swallows its own error once any of those sets has been logged, so there was
  no way to undo it. `type="number"` also accepts `1e9`, and
  `Array.from({ length: 1e9 })` is an out-of-memory crash rather than a typo.

  Ten is past anything real: Colby's own programming is two working sets plus
  a drop set.
*/
export const MAX_SETS_PER_EXERCISE = 10;

/** How many sets to actually create, from whatever was typed in the box. */
export function parseSetCount(raw: string | null | undefined): number {
  const n = Number((raw ?? '').trim());
  if (!Number.isFinite(n)) return 3;
  return Math.min(Math.max(1, Math.round(n)), MAX_SETS_PER_EXERCISE);
}
