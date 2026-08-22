import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { notify } from '@/lib/notifications';
import { dateOnly } from '@/lib/program-deploy';

/*
  Messages that send themselves.

  Three of them, and they exist for different reasons:

  - daily_check_in — the "how we feelin, whats on the agenda today" that
    currently gets pasted into thirty threads one at a time every morning.
    It is the single most repeated action in the whole business.
  - gone_quiet — nobody has heard from a client in three days. This is the
    one that actually saves relationships, because the point where someone
    goes silent is the point before they leave, and it is also the point they
    are least likely to reach out first.
  - rest_day — a rest day asks nothing of the client, so nothing arrives, and
    the app goes quiet exactly when the habit is most fragile.

  Four rules keep it from reading as automation:

  - The coach writes every line, in the console, in their own words. Nothing
    here generates text.
  - Several per trigger, rotated, so the same client doesn't get the same
    sentence every Thursday for six months.
  - At most ONE automatic message per client per day across all three
    triggers. Without that a rest day plus a quiet streak means two bot
    messages before breakfast, which is how a client learns to ignore both.
  - Nothing sends to someone the coach has already spoken to himself. The
    whole value is covering the threads he didn't get to.
*/

export const REST_DAY = 'rest_day';
export const DAILY_CHECK_IN = 'daily_check_in';
export const GONE_QUIET = 'gone_quiet';

/**
 * Priority order, most specific first.
 *
 * A client who has gone quiet should hear the quiet line, not the generic
 * morning one — and because only one sends per day, order is the whole
 * mechanism for choosing which.
 */
export const TRIGGERS = [GONE_QUIET, REST_DAY, DAILY_CHECK_IN] as const;
export type Trigger = (typeof TRIGGERS)[number];

export const TRIGGER_LABELS: Record<Trigger, string> = {
  [GONE_QUIET]: 'Gone quiet',
  [REST_DAY]: 'Rest day',
  [DAILY_CHECK_IN]: 'Daily check-in',
};

/** How long without hearing from someone counts as quiet. */
export const QUIET_DAYS = 3;

/**
 * Picks the line to send.
 *
 * Rotation is by day-of-year rather than random so that two clients on the
 * same day get different lines, and one client walks through the whole set
 * before repeating — random selection would send the same one twice in a row
 * often enough to be noticed.
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

export type AutoRun = {
  considered: number;
  sent: number;
  skipped: number;
  byTrigger: Record<string, number>;
};

type Candidate = { clientId: string; coachId: string; trigger: Trigger };

/**
 * Works out who should hear what today.
 *
 * Returns at most one row per client — the first trigger that matches, in
 * priority order — so the one-per-day rule is decided here rather than being
 * something the sender has to remember.
 */
async function candidates(today: Date): Promise<Candidate[]> {
  const active = await prisma.client.findMany({
    where: { status: 'active', coachId: { not: null } },
    select: { userId: true, coachId: true },
  });
  if (active.length === 0) return [];

  const ids = active.map((c) => c.userId);
  const coachOf = new Map(active.map((c) => [c.userId, c.coachId as string]));

  // Anyone with a rest day on the calendar today.
  const resting = new Set(
    (
      await prisma.scheduledItem.findMany({
        where: { clientId: { in: ids }, date: today, kind: 'rest' },
        select: { clientId: true },
        distinct: ['clientId'],
      })
    ).map((r) => r.clientId)
  );

  /*
    The last time each client said anything.

    Grouped in one query rather than asked per client — at forty clients that
    is the difference between one round trip and forty, and this runs on a
    schedule where nobody is watching it be slow.
  */
  const lastInbound = await prisma.message.groupBy({
    by: ['senderId'],
    where: { senderId: { in: ids } },
    _max: { createdAt: true },
  });
  const spokeAt = new Map(lastInbound.map((r) => [r.senderId, r._max.createdAt]));

  // And the last time the coach said anything to them, so we never talk over
  // a conversation he is already having.
  const lastOutbound = await prisma.message.groupBy({
    by: ['recipientId'],
    where: { recipientId: { in: ids } },
    _max: { createdAt: true },
  });
  const heardFromCoachAt = new Map(lastOutbound.map((r) => [r.recipientId, r._max.createdAt]));

  const quietCutoff = new Date(today.getTime() - QUIET_DAYS * 86_400_000);
  const out: Candidate[] = [];

  for (const { userId } of active) {
    const coachId = coachOf.get(userId);
    if (!coachId) continue;

    // Already spoken to today, by anyone. Leave it alone.
    const coachLast = heardFromCoachAt.get(userId);
    if (coachLast && coachLast >= today) continue;

    const theirLast = spokeAt.get(userId) ?? null;

    if (!theirLast || theirLast < quietCutoff) {
      out.push({ clientId: userId, coachId, trigger: GONE_QUIET });
    } else if (resting.has(userId)) {
      out.push({ clientId: userId, coachId, trigger: REST_DAY });
    } else {
      out.push({ clientId: userId, coachId, trigger: DAILY_CHECK_IN });
    }
  }

  return out;
}

/**
 * Sends today's automatic messages.
 *
 * Returns counts rather than throwing on individual failures: one client with
 * a broken relationship must not stop the other forty from hearing from their
 * coach.
 */
export async function runAutoMessages(now = new Date()): Promise<AutoRun> {
  const today = dateOnly(now);
  let sent = 0;
  let skipped = 0;
  const byTrigger: Record<string, number> = {};

  const list = await candidates(today);

  for (const { clientId, coachId, trigger } of list) {
    try {
      /*
        One per client per day, across every trigger — checked without naming
        one, so a rest-day message yesterday doesn't block a check-in today
        but a check-in this morning blocks everything else until tomorrow.
      */
      const already = await prisma.autoMessageSend.findFirst({
        where: { clientId, date: today },
        select: { id: true },
      });
      if (already) {
        skipped += 1;
        continue;
      }

      const lines = await prisma.autoMessage.findMany({
        where: { coachId, trigger, active: true },
        orderBy: { position: 'asc' },
      });
      if (lines.length === 0) {
        skipped += 1;
        continue;
      }

      const line = pick(lines, today, clientOffset(clientId));

      const message = await prisma.message.create({
        data: { senderId: coachId, recipientId: clientId, body: line.body },
      });

      // Claim the day. The unique index means a concurrent second run loses
      // here rather than sending a duplicate.
      await prisma.autoMessageSend.create({
        data: { id: randomUUID(), clientId, trigger, date: today, messageId: message.id },
      });

      await notify(clientId, 'message', `Message from your coach: ${line.body.slice(0, 60)}`).catch(
        () => undefined
      );

      sent += 1;
      byTrigger[trigger] = (byTrigger[trigger] ?? 0) + 1;
    } catch {
      skipped += 1;
    }
  }

  return { considered: list.length, sent, skipped, byTrigger };
}

/**
 * Kept so anything still calling the old name keeps working. The rest-day run
 * was never really separate — it was the first of the three.
 */
export async function sendRestDayMessages(now = new Date()) {
  const r = await runAutoMessages(now);
  return { checked: r.considered, sent: r.sent, skipped: r.skipped };
}
