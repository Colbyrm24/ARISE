'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { markScheduledDone } from '@/lib/scheduled';
import { requireClient } from '@/lib/auth';
import { startOfDayInstantFor } from '@/lib/day';
import { openSessionSince } from '@/lib/session-window';
import { displayName, notifyCoach } from '@/lib/notifications';
import { workoutFinishedBody } from '@/lib/activity';
import { parseLoggedWeight, parseLoggedReps } from '@/lib/set-prescription';
import { isUniqueViolation } from '@/lib/db-conflict';

/*
  `today` is the lifter's today, not the server's.

  The window bounds a `startedAt` timestamp rather than a `@db.Date` column,
  so it takes the INSTANT local midnight happened — not `todayFor`, which is
  the `@db.Date` label for the day and sits at 8pm the previous evening in
  New York. Getting either half wrong splits or merges a session: the old UTC
  midnight opened a second log for a 7pm PDT workout, and bounding by the
  date label swept last night's unfinished session into this morning.

  It reaches a few hours back past midnight so a session that straddles the
  boundary stays one session. openSessionSince carries the reasoning and the
  tests.
*/
async function getOrCreateTodayLog(
  clientId: string,
  workoutId: string,
  user: Parameters<typeof startOfDayInstantFor>[0]
) {
  const since = openSessionSince(user);
  const existing = await prisma.workoutLog.findFirst({
    where: { clientId, workoutId, startedAt: { gte: since }, completedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  if (existing) return existing;

  return prisma.workoutLog.create({ data: { clientId, workoutId } });
}

/**
 * Is this the heaviest this client has ever gone on this exercise?
 *
 * Compared across the *exercise*, not the set or the workout — a bench press
 * PB is a bench press PB whether it happened on Push A or Push B. The set
 * currently being edited is excluded so re-saving the same row can't make it
 * fail to beat itself.
 *
 * Bodyweight work (no weight entered) never counts, because there's nothing
 * to compare. Reps-based PBs would need their own rule and aren't done yet.
 */
async function detectPr({
  clientId,
  workoutSetId,
  actualWeight,
  excludeLogSetId,
}: {
  clientId: string;
  workoutSetId: string;
  actualWeight: number | null;
  excludeLogSetId?: string;
}): Promise<boolean> {
  if (!actualWeight || actualWeight <= 0) return false;

  const set = await prisma.workoutSet.findUnique({
    where: { id: workoutSetId },
    select: { workoutExercise: { select: { exerciseId: true } } },
  });
  const exerciseId = set?.workoutExercise?.exerciseId;
  if (!exerciseId) return false;

  const best = await prisma.workoutLogSet.aggregate({
    _max: { actualWeight: true },
    where: {
      workoutLog: { clientId },
      workoutSet: { workoutExercise: { exerciseId } },
      ...(excludeLogSetId ? { id: { not: excludeLogSetId } } : {}),
    },
  });

  const previous = best._max.actualWeight ? Number(best._max.actualWeight) : 0;
  return actualWeight > previous;
}

/**
 * The workout, only if it is in the program this client is actually on.
 *
 * The page that renders these forms already refuses a workout outside the
 * assigned program — "never trust the URL alone" — and then the actions it
 * submits to trusted the URL alone. A Server Action is reachable directly,
 * and `requireClient` (not `requireEntitledClient`) means a lead, a paused,
 * or an unassigned account reaches these too. So any client could POST a
 * workoutId from any coach's template and write training history against a
 * program nobody gave them: sessions that never happened on their coach's
 * rail, and personal bests off sets they were never assigned.
 */
async function assignedWorkout(clientId: string, workoutId: string) {
  const [assigned, workout] = await Promise.all([
    prisma.clientProgram.findFirst({
      where: { clientId, active: true },
      select: { templateId: true },
    }),
    prisma.workout.findUnique({ where: { id: workoutId }, select: { id: true, templateId: true } }),
  ]);
  if (!assigned || !workout) return null;
  return workout.templateId === assigned.templateId ? workout : null;
}

/** Logs (or updates) one set's actual weight/reps for today's session. */
export async function logSet(formData: FormData) {
  const user = await requireClient();

  const workoutId = formData.get('workoutId') as string | null;
  /*
    `setId`, the value the tick button carries.

    The page is one form for the whole session now, so this posts with every
    row's boxes in it and the button has to name which row it is. The old
    `workoutSetId` hidden input belonged to a per-row form that no longer
    exists.
  */
  const workoutSetId = formData.get('setId') as string | null;
  if (!workoutId || !workoutSetId) return;

  if (!(await assignedWorkout(user.id, workoutId))) return;

  // And the set has to belong to that workout — two ids on one form, so
  // neither is trusted to vouch for the other.
  const set = await prisma.workoutSet.findUnique({
    where: { id: workoutSetId },
    select: { workoutExercise: { select: { workoutId: true } } },
  });
  if (set?.workoutExercise.workoutId !== workoutId) return;

  /*
    Bounded, and tri-state. See parseLoggedWeight for why: `Number(raw)` with
    no checks let a fat-fingered 22555 through to a Decimal(6,2) column, where
    Postgres rejected it, this action threw, and the client lost the whole
    screen mid-session. `undefined` now means "leave it alone", `null` means
    the client cleared the box, a number means write it.
  */
  const actualWeight = parseLoggedWeight(formData.get(`w_${workoutSetId}`) as string | null);
  const actualReps = parseLoggedReps(formData.get(`r_${workoutSetId}`) as string | null);

  const log = await getOrCreateTodayLog(user.id, workoutId, user);
  await writeLoggedSet({
    clientId: user.id,
    workoutLogId: log.id,
    workoutSetId,
    actualWeight,
    actualReps,
  });

  revalidatePath(`/workouts/${workoutId}`);
}

/**
 * Writes one set row. Shared by the tick, which saves a single row, and by
 * Finish, which saves every row that has a number in it.
 */
async function writeLoggedSet({
  clientId,
  workoutLogId,
  workoutSetId,
  actualWeight,
  actualReps,
}: {
  clientId: string;
  workoutLogId: string;
  workoutSetId: string;
  actualWeight: number | null | undefined;
  actualReps: number | null | undefined;
}) {
  const existingSet = await prisma.workoutLogSet.findFirst({
    where: { workoutLogId, workoutSetId },
  });

  const isPr = await detectPr({
    clientId,
    workoutSetId,
    actualWeight: actualWeight ?? null,
    excludeLogSetId: existingSet?.id,
  });

  if (existingSet) {
    /*
      A personal best, once earned, is never taken away by re-saving the row.

      Two ways it used to vanish. A blank weight box: `?? undefined` protected
      the weight and the reps, `isPr` was written unconditionally, and
      `detectPr` returns false the moment there is no weight to compare — so
      resubmitting a PR row with only the reps filled left it reading 225 lb
      with the flag gone. That one bites without anyone doing anything odd,
      because a stored weight of 0 renders as an empty box.

      The other survived that fix. `detectPr` excludes the row being edited so
      it can't fail to beat itself — but it does NOT exclude the row's
      siblings. Hit 225 for a new PB on set 1, then match it on sets 2 and 3
      (correctly not flagged), then tap set 1's tick again to correct the
      reps: set 2 now supplies the record, 225 > 225 is false, and the badge
      is written away. The tick's own label says "Update set 1", so re-tapping
      it is the obvious thing to do, and there was no way to get the PR back.

      So the flag is only ever raised here, never lowered. A false positive
      would need a client to have genuinely lifted the weight; the failure in
      the other direction erased something real.
    */
    /*
      One exception to "never lowered": the client clearing the weight box.

      That is an explicit act on the one field the record is made of, and a
      personal best with no weight behind it is not a record. Everything the
      comment above protects against — a blank box that was never touched, a
      sibling set supplying the comparison — arrives as `undefined`, not
      `null`, and still leaves the badge alone.
    */
    const keepsPr =
      actualWeight === null ? false : existingSet.isPr || (typeof actualWeight === 'number' && isPr);

    await prisma.workoutLogSet.update({
      where: { id: existingSet.id },
      // Passed straight through: undefined leaves the column, null clears it.
      data: { actualWeight, actualReps, isPr: keepsPr },
    });
  } else {
    /*
      The insert can lose a race, and now it says so instead of duplicating.

      findFirst-then-create had no constraint behind it, so two submits a
      moment apart both missed the read and both inserted. The screen hid it
      completely — the page reads these rows through a Map keyed on
      workoutSetId, so the client and the coach both saw one row — while
      `completeWorkout` totals volume by summing log.sets and counted it
      twice, turning 225x8 into 3,600 lb.

      There is now a unique index on (workoutLogId, workoutSetId), so the
      loser of that race gets P2002 and is handled as what it actually is: an
      update to the row the winner just wrote. A plain upsert cannot be used
      here because the PR rule needs the existing row to decide what to keep.
    */
    try {
      await prisma.workoutLogSet.create({
        data: {
          workoutLogId,
          workoutSetId,
          // On a new row there is nothing to preserve, so both blank and
          // absent mean the same thing.
          actualWeight: actualWeight ?? undefined,
          actualReps: actualReps ?? undefined,
          isPr,
        },
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      await prisma.workoutLogSet.updateMany({
        where: { workoutLogId, workoutSetId },
        data: { actualWeight, actualReps, ...(isPr ? { isPr: true } : {}) },
      });
    }
  }
}


/**
 * Every set row the submitted form carried a number for.
 *
 * The inputs are named `w_<setId>` and `r_<setId>` because one form for the
 * whole session means one flat namespace. Returns the set ids that have
 * something worth writing, so Finish saves exactly the rows the client filled
 * in and leaves the blank ones blank.
 */
function submittedSetIds(formData: FormData): string[] {
  const ids = new Set<string>();
  for (const [key, value] of formData.entries()) {
    const m = /^([wr])_(.+)$/.exec(key);
    if (!m) continue;
    if (typeof value !== 'string' || value.trim() === '') continue;
    ids.add(m[2]!);
  }
  return [...ids];
}

/** Marks today's session for this workout as complete and totals up volume. */
export async function completeWorkout(formData: FormData) {
  const user = await requireClient();

  const workoutLogId = formData.get('workoutLogId') as string | null;
  const workoutId = formData.get('workoutId') as string | null;
  if (!workoutId) return;

  // Same gate as logSet. This one creates a WorkoutLog from a bare workoutId
  // when none exists, so without it any client could manufacture a completed
  // session — with a duration and a volume — against a workout from a program
  // they were never on.
  if (!(await assignedWorkout(user.id, workoutId))) return;

  /*
    A workout can be finished without a single set logged.

    The button used to be hidden until a WorkoutLog existed, and a log only
    appeared once a set was logged — so a circuit, a bodyweight session, or
    anyone who trains and doesn't log could never mark a session done. Their
    Today card said "Not started" forever and the workout habit never ticked.
  */
  /*
    The fallback is bounded to the session in progress, same as logSet.

    It used to have no date bound at all, and nothing in the app ever closes
    an abandoned log — so incomplete logs pile up forever. The hidden
    workoutLogId is empty exactly when today has no log yet, which is the
    circuit-session case this branch exists for, so the unbounded query went
    looking and found the oldest wound in the table: an unfinished session
    from a previous week.

    Finishing that one wrote a duration of seven days, a volume totalled from
    last week's sets, and ticked LAST week's calendar chip while today's
    stayed hollow. Today still had no log, so the list said nothing was done
    and the Finish button came back — from the client's side the button
    simply did nothing.
  */
  let log = workoutLogId
    ? await prisma.workoutLog.findUnique({ where: { id: workoutLogId }, include: { sets: true } })
    : await prisma.workoutLog.findFirst({
        where: {
          clientId: user.id,
          workoutId,
          startedAt: { gte: openSessionSince(user) },
        },
        orderBy: { startedAt: 'desc' },
        include: { sets: true },
      });

  /*
    Already finished: nothing to do, and specifically nothing to create.

    The fallback above used to require `completedAt: null`, and the hidden
    workoutLogId is empty on exactly the path that uses the fallback — a
    circuit or bodyweight session with no logged sets. So a second submit
    found no OPEN log, fell through to the create below, and wrote a whole
    second completed session with a duration of zero, told the coach a
    second time, and left the client with two sessions for one workout. The
    button has no pending state of its own on a slow connection, which is
    what produces the second submit.
  */
  if (log?.completedAt) {
    revalidatePath(`/workouts/${workoutId}`);
    redirect('/workouts');
  }

  if (!log) {
    log = await prisma.workoutLog.create({
      data: { clientId: user.id, workoutId, startedAt: new Date() },
      include: { sets: true },
    });
  }
  if (log.clientId !== user.id) return;

  /*
    Save what they typed, before closing the session on top of it.

    This is the whole reason the page is now one form. Every set row used to
    be its own form and Finish was a separate one carrying two ids — so a
    client who filled in the page and then pressed the big button at the
    bottom had every number discarded, the session recorded as complete with
    zero volume, and no way back in. Working down a form and submitting it is
    not a mistake a person can be expected not to make; it is what a form is.

    Only rows with something in a box are written, so finishing a session with
    four sets left blank still leaves those four blank rather than inventing
    empty ones. Each row is verified to belong to this workout — a Server
    Action is reachable directly, so the ids in the form vouch for nothing.
  */
  const typed = submittedSetIds(formData);
  if (typed.length > 0) {
    const belong = await prisma.workoutSet.findMany({
      where: { id: { in: typed }, workoutExercise: { workoutId } },
      select: { id: true },
    });

    for (const { id: workoutSetId } of belong) {
      await writeLoggedSet({
        clientId: user.id,
        workoutLogId: log.id,
        workoutSetId,
        actualWeight: parseLoggedWeight(formData.get(`w_${workoutSetId}`) as string | null),
        actualReps: parseLoggedReps(formData.get(`r_${workoutSetId}`) as string | null),
      });
    }

    // Re-read, because the volume below is totalled from these rows and the
    // copy loaded above predates every one of the writes just made.
    log = await prisma.workoutLog.findUniqueOrThrow({
      where: { id: log.id },
      include: { sets: true },
    });
  }

  const totalVolume = log.sets.reduce((sum, s) => {
    const w = s.actualWeight ? Number(s.actualWeight) : 0;
    const r = s.actualReps ?? 0;
    return sum + w * r;
  }, 0);

  const completedAt = new Date();
  const duration = Math.round((completedAt.getTime() - log.startedAt.getTime()) / 1000);

  await prisma.workoutLog.update({
    where: { id: log.id },
    data: { completedAt, duration, totalVolume },
  });

  /*
    Tick the day on the coach's calendar. That screen draws a filled chip for
    a finished session, and nothing anywhere ever set the field it reads, so
    a client who trained every day still showed a month of hollow chips and
    a header saying "Workouts 0/12".

    Attributed to startedAt, not to now. Somebody who starts at 11:50pm and
    finishes after midnight trained on the earlier day, which is what every
    other query in the app already assumes.
  */
  await markScheduledDone(user.id, 'workout', { workoutId, startedAt: log.startedAt });

  /*
    Tell the coach. This is the single most common thing a client does and
    the feed never mentioned it once — the whole notification path existed
    and no one called it for training.

    After the write, and swallowed by notify() itself, so a coach with no
    push subscription or no assigned relationship can't cost the client the
    session they just finished.
  */
  const [name, workout] = await Promise.all([
    displayName(user.id),
    prisma.workout.findUnique({ where: { id: workoutId }, select: { name: true } }),
  ]);
  await notifyCoach(user.id, 'activity', workoutFinishedBody(name, workout?.name, duration));

  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath('/workouts');
  revalidatePath('/today');
  redirect('/workouts');
}

/**
 * Puts an accidentally-finished session back.
 *
 * Finishing was a one-way door. `completedAt` disables every input, replaces
 * every tick with a static square and hides the Finish button, and nothing
 * anywhere set that column back to null — the only two exported actions were
 * `logSet` and `completeWorkout`. So a client who caught that full-width
 * button with a thumb after set one, at the bottom of a long scroll, one
 * handed, mid-session, could not log another set for the rest of the day, and
 * the session went to their coach as a finished workout with one set in it.
 *
 * Bounded to the current session window, so this can only reopen the session
 * the client is standing in front of — not last week's, and not anybody
 * else's.
 */
export async function reopenWorkout(formData: FormData) {
  const user = await requireClient();

  const workoutId = formData.get('workoutId') as string | null;
  const workoutLogId = formData.get('workoutLogId') as string | null;
  if (!workoutId) return;

  if (!(await assignedWorkout(user.id, workoutId))) return;

  const log = workoutLogId
    ? await prisma.workoutLog.findUnique({ where: { id: workoutLogId } })
    : await prisma.workoutLog.findFirst({
        where: { clientId: user.id, workoutId, startedAt: { gte: openSessionSince(user) } },
        orderBy: { startedAt: 'desc' },
      });

  if (!log || log.clientId !== user.id || log.workoutId !== workoutId) return;
  if (log.startedAt < openSessionSince(user)) return;

  /*
    duration and totalVolume go back to null with it. Leaving a duration on a
    reopened session means the next finish writes a second one over a figure
    that already counted, and the client's own history briefly shows a
    session that is both in progress and 42 minutes long.

    The scheduled-calendar tick is deliberately NOT undone. The coach has
    already been told the session happened, and it is about to happen again
    in the next few minutes; flickering a chip off and back on his calendar
    communicates nothing.
  */
  await prisma.workoutLog.update({
    where: { id: log.id },
    data: { completedAt: null, duration: null, totalVolume: null },
  });

  revalidatePath(`/workouts/${workoutId}`);
  revalidatePath('/workouts');
  revalidatePath('/today');
}
