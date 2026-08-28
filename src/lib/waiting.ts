import { prisma } from '@/lib/prisma';
import { avatarSrc } from '@/lib/avatars';
import {
  assembleThreads,
  splitEdges,
  waitingIdsFrom,
  type Edge,
  type Preview,
  type Run,
  type WaitingThread,
} from '@/lib/waiting-shape';

export { waitLevel, waitLabel, sortThreads } from '@/lib/waiting-shape';
export type { WaitingThread, WaitLevel } from '@/lib/waiting-shape';

/*
  The inbox in four queries instead of two per client.

  What was here before ran a findFirst and a count inside a map over the
  relationship list — eighty round trips for a forty-client roster, on the
  page a coach opens more than any other. Everything below is grouped across
  the whole roster, so the cost is flat however many clients he takes on.

  Only the fetching lives here. The join is in waiting-shape.ts, which has no
  database import and is therefore the part that can be tested — worth
  separating because the offline Prisma stub types every groupBy as `any[]`,
  so a typecheck says nothing at all about these result shapes.
*/

/*
  Cast through `unknown`.

  Casting a groupBy call straight to a Promise type looks harmless and does
  not compile against real Prisma. Casting the call expression itself feeds the expected
  type back into groupBy's generic inference, which then demands the ARGUMENT
  be an array too: "Argument of type '{ by; where; _max }' is not assignable
  to parameter of type '{...} & {...}[]'". Going through `unknown` breaks that
  feedback loop, and awaiting first (as the count query below does) avoids it
  entirely.

  This is precisely the class of error the offline stub cannot see, because it
  types groupBy as `(args: any) => Promise<any[]>`. It reached Vercel and
  failed the build there.
*/

/** Both directions of every thread this coach has, as one filter. */
function betweenCoachAnd(coachId: string, clientIds: string[]) {
  return {
    OR: [
      { senderId: coachId, recipientId: { in: clientIds } },
      { senderId: { in: clientIds }, recipientId: coachId },
    ],
  };
}

export async function getWaitingThreads(coachId: string): Promise<WaitingThread[]> {
  const rels = await prisma.coachClientRelationship.findMany({
    where: { coachId, status: 'active' },
    include: { client: { include: { profile: true } } },
  });
  if (rels.length === 0) return [];

  const clientIds = rels.map((r) => r.clientId);

  const [edges, unreads] = await Promise.all([
    /*
      The newest message in each direction of each thread. Grouping by the
      pair rather than by thread is what makes this one query: a thread comes
      back as two groups, and comparing their timestamps is the entire
      "who spoke last" question.
    */
    prisma.message.groupBy({
      by: ['senderId', 'recipientId'],
      where: betweenCoachAnd(coachId, clientIds),
      _max: { createdAt: true },
    }) as unknown as Promise<Edge[]>,
    prisma.message.groupBy({
      by: ['senderId'],
      where: { senderId: { in: clientIds }, recipientId: coachId, readAt: null },
      _count: { _all: true },
    }) as unknown as Promise<Array<{ senderId: string; _count: { _all: number } }>>,
  ]);

  const { mine, theirs } = splitEdges(coachId, edges);
  const waitingIds = waitingIdsFrom(clientIds, mine, theirs);

  // Second wave. Both need the timestamps above and neither needs the other.
  const [runs, previews] = await Promise.all([
    /*
      Where each unanswered run starts, and how many messages it has got.

      The cutoff is per client — his last reply to that specific person — so
      the filter is one condition each. Restricted to the waiting set, the
      only place the answer is ever read.
    */
    waitingIds.length > 0
      ? (prisma.message.groupBy({
          by: ['senderId'],
          where: {
            recipientId: coachId,
            OR: waitingIds.map((id) => {
              const since = mine.get(id);
              return since ? { senderId: id, createdAt: { gt: since } } : { senderId: id };
            }),
          },
          _min: { createdAt: true },
          _count: { _all: true },
        }) as unknown as Promise<Run[]>)
      : Promise.resolve([] as Run[]),

    /*
      The preview line, fetched against the maxima already in hand rather
      than by another sort.

      Matched as a one-millisecond range per maximum, NOT as `createdAt: { in:
      [...] }`. Prisma hands a timestamp back as a JS Date, which is
      millisecond-precision, while Postgres stores `timestamptz` to the
      microsecond — so a row written at 12:00:00.123456 comes back as
      12:00:00.123 and equality against it matches nothing. That failure is
      silent and total: every row would render "No messages yet" on threads
      full of messages. `[M, M+1ms)` is exact whatever the column's precision
      and still uses the (senderId, recipientId, createdAt) index.

      Slightly over-fetches across threads whose newest messages fall in the
      same millisecond; the join takes the newest per person, so that's
      harmless.
    */
    prisma.message.findMany({
      where: {
        AND: [
          betweenCoachAnd(coachId, clientIds),
          {
            OR: [...mine.values(), ...theirs.values()].map((at) => ({
              createdAt: { gte: at, lt: new Date(at.getTime() + 1) },
            })),
          },
        ],
      },
      select: { senderId: true, recipientId: true, body: true, createdAt: true },
    }) as unknown as Promise<Preview[]>,
  ]);

  return assembleThreads({
    coachId,
    people: rels.map((r) => ({
      clientId: r.clientId,
      name: r.client.profile?.fullName ?? r.client.email,
      avatarUrl: avatarSrc(r.client.profile),
    })),
    edges,
    runs,
    previews,
    unreadBy: new Map(unreads.map((u) => [u.senderId, u._count._all])),
  });
}

/**
 * Badge count for the sidebar.
 *
 * Deliberately not a count of unread rows. The badge has to mean what the
 * list means or the coach learns to distrust it — and a badge that clears
 * itself the moment he opens a thread is the exact failure this change is
 * about.
 */
export async function countWaitingThreads(coachId: string): Promise<number> {
  const rels = await prisma.coachClientRelationship.findMany({
    where: { coachId, status: 'active' },
    select: { clientId: true },
  });
  if (rels.length === 0) return 0;

  const clientIds = rels.map((r) => r.clientId);
  const edges = (await prisma.message.groupBy({
    by: ['senderId', 'recipientId'],
    where: betweenCoachAnd(coachId, clientIds),
    _max: { createdAt: true },
  })) as Edge[];

  const { mine, theirs } = splitEdges(coachId, edges);
  return waitingIdsFrom(clientIds, mine, theirs).length;
}
