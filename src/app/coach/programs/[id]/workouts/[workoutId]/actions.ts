'use server';

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { ownedWorkout } from '@/lib/coach-guard';
import { parseVideoUrl } from '@/lib/exercise-video';
import { loadBuilderRows } from '@/lib/workout-rows';
import { resyncTemplate } from '@/lib/program-subscribers';
import {
  DEFAULT_PRESCRIPTION,
  buildSets,
  cleanPrescription,
  equipmentFor,
  estimateFromRows,
  normalizeGroups,
  parseEstMinutes,
  parseRestSeconds,
  planSetChanges,
  readPrescription,
  thumbnailFor,
  type BuilderResult,
  type LibraryItem,
  type RowPrescription,
  type SetSpec,
} from '@/lib/workout-builder';

/*
  Autosave for the workout builder.

  Every edit on the builder screen lands here the moment it is made, so there
  is no "Save" to forget and nothing lost when a phone locks mid-build. Each
  action returns the workout's rows as the database now holds them, and the
  screen replaces its own copy with that — so what the coach is looking at is
  always what the client will get, even after a refused change.

  Security is the same shape as the program page's actions: requireCoach()
  says "is a coach", ownedWorkout() says "is THEIR workout", and every row id
  that arrives is checked to belong to that workout before anything is
  written. The workout id is the only id trusted to address the template;
  row ids are only ever looked up inside it.
*/

const NOT_YOURS: BuilderResult = { ok: false, message: 'That workout is not yours, or it no longer exists.' };

/**
 * After anything that changes what is in the session: rederive the equipment
 * chips, refresh the automatic estimate (unless the coach typed one), and
 * hand the screen the truth.
 */
async function settle(workout: { id: string; templateId: string | null }, message?: string): Promise<BuilderResult> {
  const rows = await loadBuilderRows(workout.id);
  const current = await prisma.workout.findUnique({
    where: { id: workout.id },
    select: { estMinutes: true, estMinutesManual: true },
  });
  const equipment = equipmentFor(rows);
  const auto = estimateFromRows(rows) || null;
  const estMinutes = current?.estMinutesManual ? current.estMinutes : auto;
  await prisma.workout.update({
    where: { id: workout.id },
    data: { equipment, ...(current?.estMinutesManual ? {} : { estMinutes: auto }) },
  });
  if (workout.templateId) {
    revalidatePath(`/coach/programs/${workout.templateId}`);
    revalidatePath(`/coach/programs/${workout.templateId}/workouts/${workout.id}`);
  }
  revalidatePath(`/workouts/${workout.id}`);
  return {
    ok: true,
    message,
    rows,
    estMinutes,
    estMinutesManual: current?.estMinutesManual ?? true,
    equipment,
  };
}

async function guard(workoutId: string) {
  const coach = await requireCoach();
  const workout = await ownedWorkout(coach.id, workoutId);
  return { coach, workout };
}

/** The rows among `ids` that really are in this workout. */
async function rowsIn(workoutId: string, ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.workoutExercise.findMany({
    where: { workoutId, id: { in: ids.slice(0, 200) } },
    select: { id: true },
  });
}

/* ------------------------------------------------------------------------ */
/* The header: name, minutes, instructions                                   */
/* ------------------------------------------------------------------------ */

export async function saveWorkoutDetails(
  workoutId: string,
  patch: { name?: string; instructions?: string; estMinutes?: string | number | null }
): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;

  const data: { name?: string; instructions?: string | null; estMinutes?: number | null; estMinutesManual?: boolean } = {};
  if (patch.name !== undefined) {
    const name = String(patch.name).trim().slice(0, 120);
    // A nameless workout is a blank row on the program page and a blank
    // title on the client's screen, so an emptied box keeps the old name.
    if (!name) return { ok: false, message: 'A workout needs a name.' };
    data.name = name;
  }
  if (patch.instructions !== undefined) {
    data.instructions = String(patch.instructions).trim().slice(0, 4000) || null;
  }
  if (patch.estMinutes !== undefined) {
    // Blank means "work it out for me": the flag goes back to automatic and
    // settle() writes the estimate in.
    const typed = parseEstMinutes(patch.estMinutes);
    data.estMinutesManual = typed !== null;
    if (typed !== null) data.estMinutes = typed;
  }
  await prisma.workout.update({ where: { id: workout.id }, data });
  // The name is copied onto calendar rows as their label, so a rename
  // reaches subscribers. Nothing else here does — rows point at the workout.
  if (data.name !== undefined && workout.templateId) await resyncTemplate(workout.templateId);
  return settle(workout);
}

/* ------------------------------------------------------------------------ */
/* Rows                                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Adds a movement from the library, before `beforeId` or at the end.
 *
 * Starts on DEFAULT_PRESCRIPTION — 3 x 8-10, 90s — because a row with no sets
 * renders on the client's screen as a heading with nothing under it, and
 * every coach edits the numbers anyway.
 */
export async function addExerciseToWorkout(
  workoutId: string,
  exerciseId: string,
  beforeId: string | null = null
): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;

  const exercise = await prisma.exercise.findUnique({ where: { id: exerciseId }, select: { id: true } });
  if (!exercise) return { ok: false, message: 'That exercise is no longer in the library.' };

  const existing = await prisma.workoutExercise.findMany({
    where: { workoutId: workout.id },
    orderBy: { order: 'asc' },
    select: { id: true, supersetGroup: true },
  });
  if (existing.length >= 60) return { ok: false, message: 'Sixty movements is the limit for one workout.' };

  const id = randomUUID();
  const sets = buildSets(DEFAULT_PRESCRIPTION);
  await prisma.workoutExercise.create({
    data: {
      id,
      workoutId: workout.id,
      exerciseId: exercise.id,
      order: existing.length + 1,
      sets: { create: sets.map(setData) },
    },
  });

  if (beforeId && existing.some((r) => r.id === beforeId)) {
    const at = existing.findIndex((r) => r.id === beforeId);
    const order = [...existing.slice(0, at), { id, supersetGroup: null }, ...existing.slice(at)];
    await writeOrder(workout.id, order);
  }
  return settle(workout);
}

function setData(s: SetSpec) {
  return {
    setNumber: s.setNumber,
    type: s.type,
    targetReps: s.targetReps,
    targetWeight: s.targetWeight,
    restSeconds: s.restSeconds,
    tempo: s.tempo,
  };
}

/**
 * Writes a whole new order (and superset grouping) for the workout.
 *
 * The browser works out the new order with the same functions in
 * src/lib/workout-builder.ts and sends the list; this re-normalises it rather
 * than trusting it, and ignores any id that is not a row of this workout.
 * Rows the list leaves out keep their place at the end, so a stale screen can
 * reorder but never lose anything.
 */
export async function reorderWorkout(
  workoutId: string,
  order: { id: string; supersetGroup: string | null }[]
): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;
  await writeOrder(workout.id, order);
  return settle(workout);
}

async function writeOrder(workoutId: string, order: { id: string; supersetGroup: string | null }[]) {
  const existing = await prisma.workoutExercise.findMany({
    where: { workoutId },
    orderBy: { order: 'asc' },
    select: { id: true, supersetGroup: true },
  });
  const known = new Set(existing.map((r) => r.id));
  const seen = new Set<string>();
  const listed = order
    .filter((r) => known.has(r.id) && !seen.has(r.id) && seen.add(r.id))
    .map((r) => ({
      id: r.id,
      // Group ids are opaque labels; capping them stops a crafted request
      // from writing a novel into the column.
      supersetGroup: typeof r.supersetGroup === 'string' && r.supersetGroup ? r.supersetGroup.slice(0, 40) : null,
    }));
  const leftover = existing.filter((r) => !seen.has(r.id));
  const final = normalizeGroups([...listed, ...leftover], () => randomUUID());
  await prisma.$transaction(
    final.map((r, i) =>
      prisma.workoutExercise.update({
        where: { id: r.id },
        data: { order: i + 1, supersetGroup: r.supersetGroup },
      })
    )
  );
}

/**
 * Saves one row's prescription and note.
 *
 * Set rows are reconciled by position (planSetChanges) so a client's logged
 * history stays on the set it was logged against, and lowering the count
 * under a logged set is refused with a reason instead of failing on the
 * foreign key halfway through.
 */
export async function saveRow(
  workoutId: string,
  rowId: string,
  patch: { prescription?: Partial<Record<keyof RowPrescription, unknown>>; notes?: string | null }
): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;
  const row = await prisma.workoutExercise.findFirst({
    where: { id: rowId, workoutId: workout.id },
    include: { sets: { include: { _count: { select: { logs: true } } } } },
  });
  if (!row) return { ok: false, message: 'That exercise is no longer in this workout.' };

  if (patch.notes !== undefined) {
    await prisma.workoutExercise.update({
      where: { id: row.id },
      data: { notes: (patch.notes ?? '').toString().trim().slice(0, 1000) || null },
    });
  }

  if (patch.prescription) {
    const current = readPrescription(
      row.sets
        .slice()
        .sort((a, b) => a.setNumber - b.setNumber)
        .map((s) => ({
          type: s.type,
          targetReps: s.targetReps,
          targetWeight: s.targetWeight === null ? null : Number(s.targetWeight),
          restSeconds: s.restSeconds,
          tempo: s.tempo,
        }))
    );
    const next = cleanPrescription({ ...current, ...patch.prescription });
    const plan = planSetChanges(
      row.sets.map((s) => ({ id: s.id, setNumber: s.setNumber, hasLogs: s._count.logs > 0 })),
      buildSets(next)
    );
    if (!plan.ok) return { ...(await settle(workout)), ok: false, message: plan.reason };

    await prisma.$transaction([
      ...(plan.deletes.length ? [prisma.workoutSet.deleteMany({ where: { id: { in: plan.deletes } } })] : []),
      ...plan.updates.map((u) => prisma.workoutSet.update({ where: { id: u.id }, data: setData(u.spec) })),
      ...(plan.creates.length
        ? [prisma.workoutSet.createMany({ data: plan.creates.map((s) => ({ ...setData(s), workoutExerciseId: row.id })) })]
        : []),
    ]);
  }
  return settle(workout);
}

/** A rest block after this row, or none (null / 0). */
export async function setRestAfter(workoutId: string, rowId: string, seconds: number | null): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;
  const found = await rowsIn(workout.id, [rowId]);
  if (found.length === 0) return { ok: false, message: 'That exercise is no longer in this workout.' };
  await prisma.workoutExercise.update({
    where: { id: rowId },
    data: { restAfterSeconds: parseRestSeconds(seconds) },
  });
  return settle(workout);
}

/**
 * Copies rows, each landing straight after its original with the same sets.
 *
 * A copy inside a superset joins the superset — it lands between members —
 * which is what duplicating "A2" to make an "A3" should do.
 */
export async function duplicateRows(workoutId: string, ids: string[]): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;
  const all = await prisma.workoutExercise.findMany({
    where: { workoutId: workout.id },
    orderBy: { order: 'asc' },
    include: { sets: { orderBy: { setNumber: 'asc' } } },
  });
  const chosen = new Set(ids);
  if (!all.some((r) => chosen.has(r.id))) return settle(workout);
  if (all.length + chosen.size > 60) return { ok: false, message: 'Sixty movements is the limit for one workout.' };

  const order: { id: string; supersetGroup: string | null }[] = [];
  const creates = [];
  for (const r of all) {
    order.push({ id: r.id, supersetGroup: r.supersetGroup });
    if (!chosen.has(r.id)) continue;
    const id = randomUUID();
    order.push({ id, supersetGroup: r.supersetGroup });
    creates.push(
      prisma.workoutExercise.create({
        data: {
          id,
          workoutId: workout.id,
          exerciseId: r.exerciseId,
          order: all.length + creates.length + 1,
          notes: r.notes,
          restAfterSeconds: r.restAfterSeconds,
          sets: {
            create: r.sets.map((s) => ({
              setNumber: s.setNumber,
              type: s.type,
              targetReps: s.targetReps,
              targetWeight: s.targetWeight,
              targetRir: s.targetRir,
              tempo: s.tempo,
              restSeconds: s.restSeconds,
            })),
          },
        },
      })
    );
  }
  await prisma.$transaction(creates);
  await writeOrder(workout.id, order);
  return settle(workout);
}

/**
 * Removes rows.
 *
 * A row a client has logged sets against cannot go — the logs reference its
 * sets and they are the client's training history — so those stay and the
 * coach is told how many, rather than the whole delete failing silently the
 * way the old trash icon did.
 */
export async function deleteRows(workoutId: string, ids: string[]): Promise<BuilderResult> {
  const { workout } = await guard(workoutId);
  if (!workout) return NOT_YOURS;
  const found = await prisma.workoutExercise.findMany({
    where: { workoutId: workout.id, id: { in: ids.slice(0, 200) } },
    select: { id: true, sets: { select: { _count: { select: { logs: true } } } } },
  });
  const logged = found.filter((r) => r.sets.some((s) => s._count.logs > 0)).map((r) => r.id);
  const free = found.filter((r) => !logged.includes(r.id)).map((r) => r.id);
  if (free.length) await prisma.workoutExercise.deleteMany({ where: { id: { in: free } } });

  // Close the gaps and drop any superset left with one member.
  const remaining = await prisma.workoutExercise.findMany({
    where: { workoutId: workout.id },
    orderBy: { order: 'asc' },
    select: { id: true, supersetGroup: true },
  });
  await writeOrder(workout.id, remaining);

  return settle(
    workout,
    logged.length
      ? `${logged.length === 1 ? 'One exercise has' : `${logged.length} exercises have`} logged sets from a client, so ${logged.length === 1 ? 'it stays' : 'they stay'}.`
      : undefined
  );
}

/* ------------------------------------------------------------------------ */
/* The library                                                               */
/* ------------------------------------------------------------------------ */

/**
 * "+ Custom exercise", made without leaving the builder.
 *
 * Same rules as createExercise in src/app/coach/exercises/actions.ts — a
 * coach, a name, a muscle and the equipment — plus the same video handling
 * as setExerciseVideo: a link that will not parse is dropped rather than
 * stored, because a broken link shown mid-workout is worse than none.
 * Difficulty is required by the table and not worth a question here.
 */
export async function createCustomExercise(input: {
  name: string;
  musclePrimary: string;
  equipment: string;
  videoUrl?: string;
}): Promise<{ ok: boolean; message?: string; item?: LibraryItem }> {
  await requireCoach();
  const name = String(input.name ?? '').trim().slice(0, 120);
  const musclePrimary = String(input.musclePrimary ?? '').trim().slice(0, 60);
  const equipment = String(input.equipment ?? '').trim().slice(0, 60);
  if (!name || !musclePrimary || !equipment) {
    return { ok: false, message: 'Give it a name, a muscle and the equipment.' };
  }

  const raw = String(input.videoUrl ?? '').trim();
  const parsed = raw ? parseVideoUrl(raw) : null;
  if (raw && !parsed) return { ok: false, message: "That video link didn't read. Use a YouTube or Vimeo link." };

  const video = parsed
    ? await prisma.exerciseVideo.create({
        data: { storageProvider: parsed.provider, externalId: parsed.externalId, thumbnailUrl: parsed.thumbnailUrl },
      })
    : null;

  const created = await prisma.exercise.create({
    data: {
      name,
      musclePrimary,
      muscleSecondary: [],
      equipment,
      difficulty: 'Intermediate',
      substitutions: [],
      tags: [],
      videoId: video?.id ?? null,
      videoUrl: parsed ? raw : null,
    },
  });

  revalidatePath('/coach/exercises');
  return {
    ok: true,
    item: {
      id: created.id,
      name: created.name,
      musclePrimary: created.musclePrimary,
      equipment: created.equipment,
      thumb: thumbnailFor({ videoUrl: created.videoUrl, video }),
    },
  };
}
