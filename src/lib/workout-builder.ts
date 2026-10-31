/*
  The pure half of the workout builder.

  The builder screen is a lot of moving parts — drag to reorder, superset
  grouping, rest blocks, one-line prescriptions, an estimated length — and
  every one of them has fiddly edge cases (a superset split in half by a drag,
  a set count lowered under a set a client already logged, "to failure" in a
  box that usually holds a number). Keeping the rules here, with no database
  and no React, is what lets them be tested rather than trusted. The screen,
  the server actions and the client's session screen all read from this one
  file, so what the coach builds is what the client sees.
*/

import { repsLabel, MAX_SETS_PER_EXERCISE, MAX_LOGGED_WEIGHT, type SetType } from './set-prescription';
import { parseVideoUrl } from './exercise-video';

/* ------------------------------------------------------------------------ */
/* Prescriptions: the sets of one movement, as the coach edits them          */
/* ------------------------------------------------------------------------ */

/**
 * One movement's prescription, as the builder edits it.
 *
 * The database stores one row per set, which is right for logging (a client
 * logs set 2, not "the prescription"), but nobody programs that way — Colby
 * writes "2 sets x 8-10 + drop set, rest 2 min". So the builder edits this
 * shape and buildSets() turns it back into rows.
 */
export type RowPrescription = {
  warmup: number;
  working: number;
  drop: number;
  reps: string | null;
  weight: number | null;
  restSeconds: number | null;
  tempo: string | null;
};

/** Just the stored columns this file reads off a set. */
export type StoredSet = {
  type: SetType | string;
  targetReps: string | null;
  targetWeight: number | null;
  restSeconds: number | null;
  tempo: string | null;
};

export const DEFAULT_PRESCRIPTION: RowPrescription = {
  warmup: 0,
  working: 3,
  drop: 0,
  reps: '8-10',
  weight: null,
  restSeconds: 90,
  tempo: null,
};

/**
 * Reads a prescription back off stored set rows.
 *
 * Reps, weight, rest and tempo come from the first working set (or the first
 * set at all, for an old row with nothing typed `working`). Rows written by
 * the earlier add-exercise form were always uniform, so nothing is lost; a
 * hand-varied row is flattened to its first working set the moment the coach
 * edits it, which is what the builder shows them.
 */
export function readPrescription(sets: StoredSet[]): RowPrescription {
  const warmup = sets.filter((s) => s.type === 'warmup').length;
  const drop = sets.filter((s) => s.type === 'drop').length;
  const working = sets.length - warmup - drop;
  const lead = sets.find((s) => s.type === 'working') ?? sets[0];
  return {
    warmup,
    working,
    drop,
    reps: lead?.targetReps ?? null,
    weight: lead?.targetWeight ?? null,
    restSeconds: lead?.restSeconds ?? null,
    tempo: lead?.tempo ?? null,
  };
}

const clampInt = (n: unknown, lo: number, hi: number, fallback: number) => {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(Math.max(lo, Math.round(v)), hi);
};

const cleanText = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim().slice(0, max);
  return t ? t : null;
};

/** Rest is an Int column; an hour is already absurd for one rest period. */
export function parseRestSeconds(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 3600);
}

/** A typed estimate, or null to go back to the automatic one. */
export function parseEstMinutes(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(Math.round(n), 600);
}

/**
 * Whatever arrived from the browser, made safe to write.
 *
 * A Server Action is a public endpoint, so this is the real limit, not the
 * input boxes. The total is capped at MAX_SETS_PER_EXERCISE for the same
 * reason the old form was: thirty set rows land on a client's daily screen
 * and cannot be taken back once one has been logged. Working sets get first
 * claim on the cap, then warm-ups, then drops.
 */
export function cleanPrescription(raw: Partial<Record<keyof RowPrescription, unknown>>): RowPrescription {
  const working = clampInt(raw.working, 1, MAX_SETS_PER_EXERCISE, DEFAULT_PRESCRIPTION.working);
  const warmup = clampInt(raw.warmup, 0, MAX_SETS_PER_EXERCISE - working, 0);
  const drop = clampInt(raw.drop, 0, MAX_SETS_PER_EXERCISE - working - warmup, 0);

  const w = raw.weight === null || raw.weight === undefined || raw.weight === '' ? NaN : Number(raw.weight);
  const weight = Number.isFinite(w) && w > 0 && w <= MAX_LOGGED_WEIGHT ? Math.round(w * 100) / 100 : null;

  return {
    warmup,
    working,
    drop,
    reps: cleanText(raw.reps, 40),
    weight,
    restSeconds: parseRestSeconds(raw.restSeconds),
    tempo: cleanText(raw.tempo, 20),
  };
}

export type SetSpec = {
  setNumber: number;
  type: SetType;
  targetReps: string | null;
  targetWeight: number | null;
  restSeconds: number | null;
  tempo: string | null;
};

/**
 * The set rows a prescription stands for: warm-ups, then working sets, then
 * drop sets — the order they are actually done in.
 *
 * A warm-up does not carry the working weight; prescribing 225 on the
 * warm-up of a 225 squat is the opposite of what a warm-up is.
 */
export function buildSets(p: RowPrescription): SetSpec[] {
  const types: SetType[] = [
    ...Array<SetType>(p.warmup).fill('warmup'),
    ...Array<SetType>(p.working).fill('working'),
    ...Array<SetType>(p.drop).fill('drop'),
  ];
  return types.map((type, i) => ({
    setNumber: i + 1,
    type,
    targetReps: p.reps,
    targetWeight: type === 'warmup' ? null : p.weight,
    restSeconds: p.restSeconds,
    tempo: p.tempo,
  }));
}

export type SetPlan =
  | { ok: true; updates: { id: string; spec: SetSpec }[]; creates: SetSpec[]; deletes: string[] }
  | { ok: false; reason: string };

/**
 * How to get from the set rows that exist to the ones the prescription wants.
 *
 * Positional, and that is deliberate: set 2 stays the same row with the same
 * id, so a client's logged history for set 2 stays attached to set 2. Only
 * rows past the new count are deleted — and a logged one cannot be (logs
 * point at it, and they are the client's record), so lowering the count
 * under a logged set is refused with a reason rather than half-applied.
 */
export function planSetChanges(
  existing: { id: string; setNumber: number; hasLogs: boolean }[],
  target: SetSpec[]
): SetPlan {
  const sorted = [...existing].sort((a, b) => a.setNumber - b.setNumber);
  const extra = sorted.slice(target.length);
  if (extra.some((s) => s.hasLogs)) {
    let floor = 0;
    sorted.forEach((s, i) => {
      if (s.hasLogs) floor = i + 1;
    });
    return {
      ok: false,
      reason: `A client has already logged set ${floor} of this exercise, so it needs at least ${floor} sets.`,
    };
  }
  return {
    ok: true,
    updates: sorted.slice(0, target.length).map((s, i) => ({ id: s.id, spec: target[i]! })),
    creates: target.slice(sorted.length),
    deletes: extra.map((s) => s.id),
  };
}

/* ------------------------------------------------------------------------ */
/* Words                                                                     */
/* ------------------------------------------------------------------------ */

/** 90 -> "90s", 120 -> "2 min", 150 -> "2 min 30s". */
export function durationText(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 120 && s % 60 !== 0) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r === 0 ? `${m} min` : `${m} min ${r}s`;
}

/**
 * The one line under an exercise name, the way Colby writes it:
 * "3 sets x 8–10 reps + drop set".
 *
 * Warm-ups lead because they are done first. A prose rep target ("to
 * failure") is left as written rather than gaining a "reps".
 */
export function prescriptionText(p: Pick<RowPrescription, 'warmup' | 'working' | 'drop' | 'reps' | 'weight'>): string {
  const parts: string[] = [];
  if (p.warmup > 0) parts.push(`${p.warmup} warm-up${p.warmup === 1 ? '' : 's'} +`);
  let main = `${p.working} ${p.working === 1 ? 'set' : 'sets'}`;
  const reps = repsLabel(p.reps);
  if (reps) main += ` x ${reps}`;
  if (p.weight) main += ` @ ${p.weight} lb`;
  parts.push(main);
  if (p.drop === 1) parts.push('+ drop set');
  else if (p.drop > 1) parts.push(`+ ${p.drop} drop sets`);
  return parts.join(' ');
}

/** "Rest 2 min between sets", or null when no rest is set. */
export function restBetweenText(restSeconds: number | null | undefined): string | null {
  if (!restSeconds || restSeconds <= 0) return null;
  return `Rest ${durationText(restSeconds)} between sets`;
}

/** The label on a rest block between two exercises. */
export function restBlockText(seconds: number): string {
  return `Rest ${durationText(seconds)}`;
}

/* ------------------------------------------------------------------------ */
/* Order and supersets                                                       */
/* ------------------------------------------------------------------------ */

export type OrderRow = { id: string; supersetGroup: string | null };

/**
 * Makes the superset groups mean what they look like.
 *
 * A superset is a run of ADJACENT rows sharing a group id. Dragging a row out
 * of the middle of one, or a different row into it, can leave the same id in
 * two places or a "superset" of one — and the client screen would then draw
 * a box around a single exercise, or two boxes labelled the same. So after
 * every change: a group id that appears in two separate runs keeps it for the
 * first run and the later run gets a fresh id; a run of one is ungrouped.
 */
export function normalizeGroups<T extends OrderRow>(rows: T[], newId: () => string): T[] {
  const out = rows.map((r) => ({ ...r }));
  const seen = new Set<string>();
  let i = 0;
  while (i < out.length) {
    const g = out[i]!.supersetGroup;
    if (!g) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < out.length && out[j + 1]!.supersetGroup === g) j += 1;
    const runLength = j - i + 1;
    if (runLength === 1) {
      out[i]!.supersetGroup = null;
    } else if (seen.has(g)) {
      const fresh = newId();
      for (let k = i; k <= j; k += 1) out[k]!.supersetGroup = fresh;
      seen.add(fresh);
    } else {
      seen.add(g);
    }
    i = j + 1;
  }
  return out;
}

/**
 * Moves one row to sit before `beforeId` (or to the end when null).
 *
 * Dropping a row between two members of a superset puts it in that superset
 * — that is where the coach put it — and a row dragged out of a superset
 * leaves it. Both fall out of taking the group of the row it lands above,
 * when that row's neighbour above shares it.
 */
export function moveRow<T extends OrderRow>(
  rows: T[],
  id: string,
  beforeId: string | null,
  newId: () => string
): T[] {
  if (id === beforeId) return rows;
  const moving = rows.find((r) => r.id === id);
  if (!moving) return rows;
  const rest = rows.filter((r) => r.id !== id);
  let at = beforeId ? rest.findIndex((r) => r.id === beforeId) : rest.length;
  if (at < 0) at = rest.length;

  const above = rest[at - 1];
  const below = rest[at];
  const landsInside = above && below && above.supersetGroup && above.supersetGroup === below.supersetGroup;
  const placed = { ...moving, supersetGroup: landsInside ? above.supersetGroup : null };

  return normalizeGroups([...rest.slice(0, at), placed, ...rest.slice(at)], newId);
}

/**
 * Groups the chosen rows into one superset.
 *
 * They do not have to be next to each other: they are gathered up at the
 * position of the first one, in their current order, which is what a coach
 * means by ticking A and D and pressing Superset.
 */
export function groupAsSuperset<T extends OrderRow>(rows: T[], ids: string[], newId: () => string): T[] {
  const chosen = new Set(ids);
  const picked = rows.filter((r) => chosen.has(r.id));
  if (picked.length < 2) return rows;
  const group = newId();
  const firstAt = rows.findIndex((r) => chosen.has(r.id));
  const before = rows.slice(0, firstAt).filter((r) => !chosen.has(r.id));
  const after = rows.slice(firstAt).filter((r) => !chosen.has(r.id));
  const grouped = picked.map((r) => ({ ...r, supersetGroup: group }));
  return normalizeGroups([...before, ...grouped, ...after], newId);
}

/** Takes the chosen rows out of whatever superset they are in. */
export function ungroup<T extends OrderRow>(rows: T[], ids: string[], newId: () => string): T[] {
  const chosen = new Set(ids);
  return normalizeGroups(
    rows.map((r) => (chosen.has(r.id) ? { ...r, supersetGroup: null } : r)),
    newId
  );
}

export type Block<T> = {
  key: string;
  superset: boolean;
  /** "A", "B"… for supersets; null for a single exercise. */
  letter: string | null;
  rows: { row: T; label: string | null }[];
};

/**
 * The list as the client trains it: single exercises, and supersets as one
 * block with their members labelled A1, A2.
 *
 * Only supersets get letters. Lettering every single movement is noise that
 * buries the one structure that changes how you train — go straight from A1
 * to A2 without resting.
 */
export function groupBlocks<T extends OrderRow>(rows: T[]): Block<T>[] {
  const blocks: Block<T>[] = [];
  let supersets = 0;
  let i = 0;
  while (i < rows.length) {
    const g = rows[i]!.supersetGroup;
    let j = i;
    if (g) while (j + 1 < rows.length && rows[j + 1]!.supersetGroup === g) j += 1;
    const members = rows.slice(i, j + 1);
    if (members.length > 1) {
      const letter = String.fromCharCode(65 + (supersets % 26));
      supersets += 1;
      blocks.push({
        key: `${g}-${rows[i]!.id}`,
        superset: true,
        letter,
        rows: members.map((row, n) => ({ row, label: `${letter}${n + 1}` })),
      });
    } else {
      blocks.push({ key: rows[i]!.id, superset: false, letter: null, rows: [{ row: rows[i]!, label: null }] });
    }
    i = j + 1;
  }
  return blocks;
}

/* ------------------------------------------------------------------------ */
/* How long it takes                                                         */
/* ------------------------------------------------------------------------ */

/** Unset rest is not zero rest; a minute is what people actually take. */
const DEFAULT_REST_SECONDS = 60;
/** Walking to the next station, loading it, finding a bench. */
const SETUP_SECONDS = 30;
/** A prose target like "to failure" or "AMRAP" is about a dozen reps. */
const PROSE_REPS = 12;

/**
 * Seconds one set takes to perform, from its rep target and tempo.
 *
 * "8-10" counts as nine, "45s" or "30 sec" is a timed hold, and anything in
 * words is treated as a hard set of about twelve.
 */
export function setWorkSeconds(targetReps: string | null | undefined, tempo: string | null | undefined): number {
  const raw = (targetReps ?? '').trim().toLowerCase();
  const timed = /^(\d+)\s*(s|sec|secs|seconds?)$/.exec(raw);
  if (timed) return Number(timed[1]);
  const timedMin = /^(\d+)\s*(m|min|mins|minutes?)$/.exec(raw);
  if (timedMin) return Number(timedMin[1]) * 60;

  let reps = 10;
  const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(raw);
  if (range) reps = (Number(range[1]) + Number(range[2])) / 2;
  else if (/^\d+$/.test(raw)) reps = Number(raw);
  else if (raw) reps = PROSE_REPS;

  return reps * secondsPerRep(tempo);
}

/**
 * A tempo like "3-1-1-0" or "31X0" is the seconds of each phase of one rep,
 * so their sum is the rep. X (explosive) counts as one. Without one, a rep
 * takes about three seconds.
 */
export function secondsPerRep(tempo: string | null | undefined): number {
  const t = (tempo ?? '').trim().toUpperCase().replace(/[\s-]/g, '');
  if (!/^[0-9X]{3,4}$/.test(t)) return 3;
  const sum = [...t].reduce((n, c) => n + (c === 'X' ? 1 : Number(c)), 0);
  return sum > 0 ? sum : 3;
}

export type EstimateRow = OrderRow & {
  restAfterSeconds: number | null;
  sets: { targetReps: string | null; restSeconds: number | null; tempo: string | null }[];
};

/**
 * Minutes the session will take: every set's work and rest, a little set-up
 * per movement, and the rest blocks between them.
 *
 * Inside a superset you go straight from A1 to A2, so every member but the
 * last skips its rest — that is the whole point of supersetting, and an
 * estimate that charged the rest twice would talk coaches out of it.
 */
export function estimateMinutes(rows: EstimateRow[]): number {
  if (rows.length === 0) return 0;
  let seconds = 0;
  for (const block of groupBlocks(rows)) {
    block.rows.forEach(({ row }, n) => {
      const lastInBlock = n === block.rows.length - 1;
      seconds += SETUP_SECONDS;
      for (const s of row.sets) {
        seconds += setWorkSeconds(s.targetReps, s.tempo);
        if (lastInBlock) seconds += s.restSeconds ?? DEFAULT_REST_SECONDS;
      }
      seconds += row.restAfterSeconds ?? 0;
    });
  }
  return Math.max(1, Math.round(seconds / 60));
}

/* ------------------------------------------------------------------------ */
/* The library side                                                          */
/* ------------------------------------------------------------------------ */

/**
 * The equipment chips for a workout, from its movements.
 *
 * "Bodyweight" is not something you go and find, so it is left off — a chip
 * row reading "Barbell · Bodyweight" tells the client nothing the first chip
 * did not.
 */
export function equipmentFor(exercises: { equipment: string | null | undefined }[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const e of exercises) {
    const name = (e.equipment ?? '').trim();
    const key = name.toLowerCase();
    if (!name || key === 'bodyweight' || key === 'none' || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

/**
 * A picture for an exercise card, from what is already stored.
 *
 * The pasted link wins when it is a YouTube link (which publishes a
 * predictable thumbnail), then the ExerciseVideo row's own thumbnail, then
 * nothing — and the card draws a neutral placeholder naming the muscle. No
 * guessed or borrowed artwork.
 */
export function thumbnailFor(exercise: {
  videoUrl?: string | null;
  video?: { thumbnailUrl: string | null } | null;
}): string | null {
  if (exercise.videoUrl) {
    const parsed = parseVideoUrl(exercise.videoUrl);
    if (parsed?.thumbnailUrl) return parsed.thumbnailUrl;
  }
  return exercise.video?.thumbnailUrl ?? null;
}

export type LibraryItem = {
  id: string;
  name: string;
  musclePrimary: string;
  equipment: string;
  thumb: string | null;
};

export type LibrarySort = 'name' | 'muscle';

/**
 * Search and filter the library in the browser.
 *
 * A few hundred rows is small enough to hold on the page, and filtering as
 * you type with no round trip is what makes building a session feel fast.
 * Every word typed has to match (name or muscle), so "inc db" finds
 * "Incline DB Press" without needing the words in order.
 */
export function filterLibrary(
  items: LibraryItem[],
  { q, muscle, equipment, sort = 'name' }: { q?: string; muscle?: string; equipment?: string; sort?: LibrarySort }
): LibraryItem[] {
  const words = (q ?? '').toLowerCase().split(/\s+/).filter(Boolean);
  const list = items.filter((it) => {
    if (muscle && it.musclePrimary !== muscle) return false;
    if (equipment && it.equipment !== equipment) return false;
    if (words.length === 0) return true;
    const hay = `${it.name} ${it.musclePrimary} ${it.equipment}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  return list.sort((a, b) =>
    sort === 'muscle'
      ? a.musclePrimary.localeCompare(b.musclePrimary) || a.name.localeCompare(b.name)
      : a.name.localeCompare(b.name)
  );
}

/* ------------------------------------------------------------------------ */
/* What the builder screen holds for one row                                 */
/* ------------------------------------------------------------------------ */

export type BuilderRow = {
  id: string;
  exerciseId: string;
  name: string;
  musclePrimary: string;
  equipment: string;
  thumb: string | null;
  supersetGroup: string | null;
  restAfterSeconds: number | null;
  notes: string | null;
  prescription: RowPrescription;
};

/** The builder's rows, in the shape estimateMinutes() reads. */
export function estimateFromRows(rows: BuilderRow[]): number {
  return estimateMinutes(
    rows.map((r) => ({
      id: r.id,
      supersetGroup: r.supersetGroup,
      restAfterSeconds: r.restAfterSeconds,
      sets: buildSets(r.prescription),
    }))
  );
}

/** What every builder action hands back: the workout as it now stands. */
export type BuilderResult = {
  ok: boolean;
  message?: string;
  rows?: BuilderRow[];
  estMinutes?: number | null;
  estMinutesManual?: boolean;
  equipment?: string[];
};
