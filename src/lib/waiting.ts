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

/*
  Whose threads count as live.

  The relationship row is the gate, and NOTHING in the app ever writes
  anything but 'active' to its status — ensureCoachAssigned and
  attachClientToCoach both upsert it active, and updateClientStatus only
  touches Client.status. So filtering on the relationship alone let a client
  who cancelled mid-conversation sit in "Waiting on you" at the top of the
  inbox forever, ageing into the red `cold` tone, holding the sidebar badge
  permanently above zero. After a year of ordinary churn that is 20 active
  clients mixed into 40 former ones and a badge that can never reach zero —
  which is precisely the badge-he-learns-to-ignore failure this file's own
  header is written to prevent.

  Client.status is the column that actually moves, so it is the one to read.
  The dashboard has always excluded these two; the inbox never did.

  Written twice, inline, rather than hoisted into a shared const — and that is
  deliberate. `{ status: { notIn: ['cancelled', 'completed'] } }` inside a
  `where` literal is contextually typed by Prisma, so the strings narrow to
  ClientStatus. The same object in a standalone const widens to `string[]`,
  which real Prisma rejects and the offline stub waves through: a local
  typecheck that passes and a Vercel build that does not. That has already
  cost this project a stale production deploy once today.

  NOT rather than a positive filter, because `clientRecord` is nullable. A
  positive `clientRecord: { status: ... }` means "the row exists AND matches",
  so a client whose Client row is missing would vanish from the inbox
  entirely, unread messages and all — trading a badge that never clears for a
  person who never appears, which is the worse of the two.
*/

export async function getWaitingThreads(coachId: string): Promise<WaitingThread[]> {
  const rels = await prisma.coachClientRelationship.findMany({
    where: {
      coachId,
      status: 'active',
      NOT: { client: { clientRecord: { status: { in: ['cancelled', 'completed'] } } } },
    },
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
      // attachments too: a voice note has no body, and without this the
      // inbox preview line read "No messages yet" on a thread that had just
      // been answered.
      select: {
        senderId: true,
        recipientId: true,
        body: true,
        createdAt: true,
        attachments: { select: { type: true } },
      },
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
  // Same live-client filter as getWaitingThreads, inline for the same reason
  // (see the comment above it). The badge has to count the same set the list
  // shows, so these two `where` clauses must stay identical.
  const rels = await prisma.coachClientRelationship.findMany({
    where: {
      coachId,
      status: 'active',
      NOT: { client: { clientRecord: { status: { in: ['cancelled', 'completed'] } } } },
    },
    select: { clientId: true },
  });
  if (rels.length === 0) return 0;

  const clientIds = rels.map((r) => r.clientId);
  const edges = (await prisma.message.groupBy({
    by: ['senderId', 'recipientId'],
    where: betweenCoachAnd(coachId, clientIds),
    _max: { createdAt: true },
    // Through `unknown` as well: awaiting first does not stop the expected
    // type flowing back into groupBy's generic inference.
  })) as unknown as Edge[];

  const { mine, theirs } = splitEdges(coachId, edges);
  return waitingIdsFrom(clientIds, mine, theirs).length;
}
