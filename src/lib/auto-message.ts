import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { dateOnly } from '@/lib/program-deploy';

/*
  Messages that send themselves.

  A rest day is the day a client is most likely to drift — nothing is asked of
  them, so nothing arrives, and the app goes quiet exactly when the habit is
  most fragile. This closes that gap: on a rest day the client still hears
  from their coach.

  Three rules keep it from reading as automation:

  - The coach writes the lines, in the console, in their own words. Nothing
    here generates text.
  - There are several per trigger and the choice rotates, so the same client
    doesn't get the same sentence every Thursday for six months.
  - It sends at most once per client per day, enforced by a unique index
    rather than by being careful about when this is called. That makes the
    function safe to run on a schedule, on a page load, or twice by accident.

  The message lands in the normal thread from the coach's own account. To the
  client it is simply a message from their coach, which is the point — and it
  means replying to it works exactly like replying to anything else.
*/

export const REST_DAY = 'rest_day';

/**
 * Picks the line to send.
 *
 * Rotation is by day-of-year rather than random so that two clients on the
 * same rest day get different lines, and one client walks through the whole
 * set before repeating — random selection would send the same one twice in a
 * row often enough to be noticed.
 */
function pick<T>(options: T[], date: Date, offset: number): T {
  const dayOfYear = Math.floor(
    (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86_400_000
  );
  return options[(dayOfYear + offset) % options.length];
}

/** A stable small number per client, so two clients rotate out of phase. */
function clientOffset(clientId: string) {
  let n = 0;
  for (let i = 0; i < clientId.length; i += 1) n = (n + clientId.charCodeAt(i)) % 997;
  return n;
}

export type RestDayRun = { checked: number; sent: number; skipped: number };

/**
 * Sends today's rest-day message to every client whose calendar says today is
 * a rest day and who hasn't already had one.
 *
 * Returns counts rather than throwing on individual failures: one client with
 * a broken relationship must not stop the other forty from hearing from their
 * coach.
 */
export async function sendRestDayMessages(now = new Date()): Promise<RestDayRun> {
  const today = dateOnly(now);
  let sent = 0;
  let skipped = 0;

  const restToday = await prisma.scheduledItem.findMany({
    where: { date: today, kind: 'rest' },
    select: { clientId: true },
    distinct: ['clientId'],
  });

  for (const { clientId } of restToday) {
    try {
      const already = await prisma.autoMessageSend.findUnique({
        where: { clientId_trigger_date: { clientId, trigger: REST_DAY, date: today } },
      });
      if (already) {
        skipped += 1;
        continue;
      }

      const client = await prisma.client.findUnique({
        where: { userId: clientId },
        select: { coachId: true, status: true },
      });
      // Only for people actually being coached right now. A lead or a
      // finished client should not be getting Thursday check-ins.
      if (!client?.coachId || client.status !== 'active') {
        skipped += 1;
        continue;
      }

      const lines = await prisma.autoMessage.findMany({
        where: { coachId: client.coachId, trigger: REST_DAY, active: true },
        orderBy: { position: 'asc' },
      });
      if (lines.length === 0) {
        skipped += 1;
        continue;
      }

      const line = pick(lines, today, clientOffset(clientId));

      const message = await prisma.message.create({
        data: { senderId: client.coachId, recipientId: clientId, body: line.body },
      });

      // Claim the day. The unique index means a concurrent second run loses
      // here rather than sending a duplicate.
      await prisma.autoMessageSend.create({
        data: {
          id: randomUUID(),
          clientId,
          trigger: REST_DAY,
          date: today,
          messageId: message.id,
        },
      });

      await notify(clientId, 'message', `Message from your coach: ${line.body.slice(0, 60)}`).catch(
        () => undefined
      );

      sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { checked: restToday.length, sent, skipped };
}
