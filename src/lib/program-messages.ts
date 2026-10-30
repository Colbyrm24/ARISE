import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { todayIn, zoneOf } from '@/lib/day';
import { addDays, dateOnly } from '@/lib/program-deploy';
import { dateToKey } from '@/lib/schedule-move';

/*
  Messages written into a program's calendar, delivered on their day.

  A coach puts "Week 4 — deload starts today, keep the weights light" on Day
  22 of the program. Deploy copies it onto each client's calendar as a
  `message` row; this sends it, from the coach, on the day it lands on — the
  client's own day, not the server's.

  The row itself is the claim. completedAt is set with a conditional update
  that only matches a row nobody has claimed yet, so two runs at once (a
  Vercel retry, the route hit by hand) can never both send it: exactly one
  update matches. Claimed BEFORE sending, the same way AutoMessageSend is, so
  a failure after the claim costs one message rather than risking two — a
  double text from a coach is worse than a missed one.

  Runs before the automatic messages in the daily cron, so a client who got a
  program message this morning doesn't also get the generic check-in: the
  automatic sender skips anyone the coach has already spoken to today.
*/

export type ProgramMessageRun = { considered: number; sent: number; skipped: number };

export async function deliverProgramMessages(now = new Date()): Promise<ProgramMessageRun> {
  const utc = dateOnly(now);

  /*
    A day either side of UTC's date, because the client's today can be either:
    at 13:00 UTC it is already tomorrow in Sydney. The exact day is decided
    per client below.
  */
  const rows = await prisma.scheduledItem.findMany({
    where: {
      kind: 'message',
      completedAt: null,
      date: { gte: addDays(utc, -1), lte: addDays(utc, 1) },
      client: { tier: 'coaching', coachId: { not: null } },
    },
    select: {
      id: true,
      clientId: true,
      date: true,
      note: true,
      client: {
        select: {
          coachId: true,
          status: true,
          user: { select: { profile: { select: { timezone: true } } } },
        },
      },
    },
    take: 1000,
  });

  let sent = 0;
  let skipped = 0;

  for (const row of rows) {
    try {
      const coachId = row.client.coachId;
      const body = row.note?.trim();
      // Only on their day — a message about "today" a day late reads wrong,
      // and a deploy with a past start date must not flush a backlog.
      const theirDay = todayIn(zoneOf(row.client.user?.profile), now);
      if (!coachId || !body || dateToKey(row.date) !== dateToKey(theirDay)) {
        skipped += 1;
        continue;
      }
      // Someone who has left doesn't get messages from a program they left.
      if (row.client.status === 'cancelled' || row.client.status === 'completed') {
        skipped += 1;
        continue;
      }

      const claim = await prisma.scheduledItem.updateMany({
        where: { id: row.id, completedAt: null },
        data: { completedAt: now },
      });
      if (claim.count !== 1) {
        skipped += 1;
        continue;
      }

      await prisma.message.create({
        data: { senderId: coachId, recipientId: row.clientId, body },
      });
      await notify(row.clientId, 'message', `Message from your coach: ${body.slice(0, 60)}`).catch(
        () => undefined
      );
      sent += 1;
    } catch (err) {
      // One client's failure must not stop the rest hearing from their coach.
      console.error('Program message failed', {
        itemId: row.id,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped += 1;
    }
  }

  return { considered: rows.length, sent, skipped };
}
