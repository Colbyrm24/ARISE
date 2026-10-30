import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  dateToKey,
  isDayKey,
  keyToDate,
  planMove,
  planShift,
  SESSION_KINDS,
  type PlanItem,
} from '@/lib/schedule-move';

/*
  Hand edits to one client's calendar: move, swap, remove, replace, push back.

  The rules themselves live in schedule-move.ts, which is pure and tested.
  This file only reads the rows the rules need and writes what they decide,
  and every function is scoped by clientId on every query — an item id from a
  form is never trusted to belong to the client the coach was looking at.

  Edited rows KEEP their deploy's templateId and batchId. That is deliberate:
  re-deploying the program is how a coach says "start this block over", and a
  re-deploy clears every unfinished row it owns from the start date forward.
  A hand-moved session that carried no templateId would survive that, sit next
  to the freshly stamped session for the same date, and the client's day would
  hold two.
*/

export type EditResult = { ok: true; message?: string } | { ok: false; message: string };

type Tx = Prisma.TransactionClient;

const toPlan = (r: { id: string; date: Date; kind: string; completedAt: Date | null }): PlanItem => ({
  id: r.id,
  date: dateToKey(r.date),
  kind: r.kind,
  completed: Boolean(r.completedAt),
});

async function applyMoves(tx: Tx, clientId: string, moves: { id: string; date: string }[]) {
  for (const m of moves) {
    // updateMany so the clientId filter rides along with the id — a row that
    // is not this client's matches nothing rather than being moved.
    // Pinned: the coach put it here on purpose, so a later resync from the
    // master program (Stage 3) leaves it where he dropped it.
    await tx.scheduledItem.updateMany({
      where: { id: m.id, clientId, completedAt: null },
      data: { date: keyToDate(m.date), pinned: true },
    });
  }
}

/** Put one session on another day, swapping with whatever was there. */
export async function moveItem(clientId: string, itemId: string, to: string): Promise<EditResult> {
  if (!isDayKey(to)) return { ok: false, message: "That date didn't read." };

  return prisma.$transaction(async (tx: Tx) => {
    const item = await tx.scheduledItem.findFirst({
      where: { id: itemId, clientId },
      select: { id: true, date: true, kind: true, completedAt: true },
    });
    if (!item) return { ok: false, message: 'That session is no longer on the calendar.' };

    const target = await tx.scheduledItem.findMany({
      where: { clientId, date: keyToDate(to) },
      select: { id: true, date: true, kind: true, completedAt: true },
    });

    const plan = planMove(toPlan(item), to, target.map(toPlan));
    if (!plan.ok) return { ok: false, message: plan.reason };

    await applyMoves(tx, clientId, plan.moves);
    return { ok: true, message: plan.moves.length > 1 ? 'Swapped.' : 'Moved.' };
  });
}

/**
 * Remembers that the coach took these program occurrences off this client's
 * calendar, on the client's subscription to the program that wrote them, so
 * a resync from the master (planSync) never writes them back. Rows with no
 * sourceKey — the old weekly deploy, hand-placed days — are never resynced
 * and need nothing.
 */
async function skipSourceKeys(tx: Tx, clientId: string, rows: { templateId: string | null; sourceKey: string | null }[]) {
  for (const r of rows) {
    if (!r.templateId || !r.sourceKey) continue;
    await tx.clientProgram.updateMany({
      where: { clientId, templateId: r.templateId, NOT: { skippedKeys: { has: r.sourceKey } } },
      data: { skippedKeys: { push: r.sourceKey } },
    });
  }
}

/** Take a session off the calendar. Finished ones are a record and stay. */
export async function removeItem(clientId: string, itemId: string): Promise<EditResult> {
  const removed = await prisma.$transaction(async (tx: Tx) => {
    const row = await tx.scheduledItem.findFirst({
      where: { id: itemId, clientId, completedAt: null },
      select: { id: true, templateId: true, sourceKey: true },
    });
    if (!row) return 0;
    const gone = await tx.scheduledItem.deleteMany({ where: { id: row.id, clientId, completedAt: null } });
    if (gone.count > 0) await skipSourceKeys(tx, clientId, [row]);
    return gone.count;
  });
  return removed > 0
    ? { ok: true, message: 'Removed.' }
    : { ok: false, message: "That one is already done or gone — it can't be removed." };
}

/**
 * Make a day a given workout, or a rest day.
 *
 * Replaces whatever unfinished session was on the day rather than adding a
 * second one, for the same reason a move swaps: a day has one session. The workout has to belong to the client's active program —
 * the client's workout screen refuses to open anything else, so placing one
 * from another program would put a session on their day that 404s on tap.
 */
export async function setDay(
  clientId: string,
  day: string,
  choice: { kind: 'workout'; workoutId: string } | { kind: 'rest' }
): Promise<EditResult> {
  if (!isDayKey(day)) return { ok: false, message: "That date didn't read." };
  const date = keyToDate(day);

  const program = await prisma.clientProgram.findFirst({
    where: { clientId, active: true },
    select: { templateId: true },
  });

  let label = 'Rest day';
  let workoutId: string | null = null;
  if (choice.kind === 'workout') {
    if (!program) return { ok: false, message: 'Start them on a program first.' };
    const workout = await prisma.workout.findFirst({
      where: { id: choice.workoutId, templateId: program.templateId },
      select: { id: true, name: true },
    });
    if (!workout) return { ok: false, message: "That workout isn't in their current program." };
    label = workout.name;
    workoutId = workout.id;
  }

  return prisma.$transaction(async (tx: Tx) => {
    /*
      Only the day's session is replaced — its unfinished lift or rest day.
      Cardio, photo and check-in reminders and a scheduled message on the
      same day are separate things the coach put there, and turning Tuesday
      into a rest day is not a request to drop Tuesday's swim.
    */
    const sessionWhere = { clientId, date, completedAt: null, kind: { in: SESSION_KINDS } };
    const existing = await tx.scheduledItem.findMany({
      where: sessionWhere,
      select: { id: true, stepTarget: true, batchId: true, templateId: true, kind: true, sourceKey: true },
    });

    // Steps are the target on every day, rest days included, so the day keeps
    // whatever step goal it already had rather than losing it to the edit.
    const keep = existing[0];
    await tx.scheduledItem.deleteMany({ where: sessionWhere });
    // Every replaced occurrence is skipped, not just the one whose key rides
    // on the new row: a day with two sessions would otherwise get the second
    // back, and removing the replacement later would restore the original.
    await skipSourceKeys(tx, clientId, existing);

    await tx.scheduledItem.create({
      data: {
        clientId,
        date,
        kind: choice.kind,
        label,
        workoutId,
        stepTarget: keep?.stepTarget ?? null,
        batchId: keep?.batchId ?? null,
        // Owned by the program, so a re-deploy replaces it like any other day.
        templateId: keep?.templateId ?? program?.templateId ?? null,
        /*
          The replaced session's sourceKey rides along on the pinned row, so a
          resync from the master sees that occurrence as hand-placed and
          doesn't write the original session back onto the same day.
        */
        sourceKey: keep?.sourceKey ?? null,
        pinned: true,
      },
    });

    return { ok: true, message: choice.kind === 'rest' ? 'Now a rest day.' : `Now ${label}.` };
  });
}

/** Slide every unfinished session from a day onward back by N days. */
export async function shiftFrom(clientId: string, from: string, days: number): Promise<EditResult> {
  if (!isDayKey(from)) return { ok: false, message: "That date didn't read." };

  // The rule check, on the same terms the planner enforces. Only the count is
  // needed from the database for the message; the move itself is one
  // statement below.
  const plan = planShift([], from, days);
  if (!plan.ok) return { ok: false, message: plan.reason };

  /*
    One UPDATE, not one per row. A six-month block is ~180 rows, and 180
    round trips is exactly the serverless timeout this project has already
    hit once. Every row moves by the same number of days, so Postgres can do
    the whole thing in a single statement and it is atomic for free — there
    is never a moment where half the program has moved.

    `date + int` is calendar-day arithmetic on a Postgres date, so a DST
    change in the middle of the block cannot skip or repeat a day.

    Pinned like a drag, so a later resync from the master program does not
    pull the pushed-back days forward again.

    client_id is compared as text because the live database's id columns are
    TEXT while the Prisma schema has drifted from it in places; the cast makes
    this correct whichever one the column turns out to be.
  */
  const moved = await prisma.$executeRaw`
    UPDATE scheduled_items
       SET date = date + ${days}::int,
           pinned = true
     WHERE client_id::text = ${clientId}
       AND date >= ${from}::date
       AND completed_at IS NULL
  `;

  if (moved === 0) return { ok: true, message: 'Nothing to push back.' };
  return {
    ok: true,
    message: `Pushed ${moved} session${moved === 1 ? '' : 's'} back ${days} day${days === 1 ? '' : 's'}.`,
  };
}
