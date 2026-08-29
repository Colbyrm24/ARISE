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
