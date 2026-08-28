/*
  Who is actually waiting on a reply.

  The inbox used to sort by unread count, which sounds like the same question
  and isn't. Opening a thread marks it read — that write lives in the thread
  page and it fires on render, before the coach has typed anything. So the
  moment he taps a client to see what they said and then gets pulled into
  something else, that client silently leaves the "needs a reply" list and
  never comes back to it.

  That is exactly how threads go quiet for three days. The signal that matters
  is not "have you looked at this", it is "did the last message come from
  them" — the same rule any coach applies scanning his own Messages app. Unread
  is still worth showing, but as a second, smaller fact: unread means unseen,
  waiting means unanswered, and the second one is the one that costs clients.
*/

export type WaitLevel = 'fresh' | 'today' | 'stale' | 'cold';

export type WaitingThread = {
  clientId: string;
  name: string;
  initials: string;
  /** Their profile photo, when they've set one. */
  avatarUrl: string | null;
  /** Preview text of the most recent message in either direction. */
  lastBody: string | null;
  lastAt: Date | null;
  /** True when the last word in the thread was theirs. This is the whole signal. */
  waiting: boolean;
  /**
   * When the current unanswered run began — their first message after his last
   * reply, not their most recent one.
   *
   * A client who asked a question at 8am and followed up at 4pm has been
   * waiting since 8am. Measuring from the newest message would reward them for
   * chasing, and would rank the patient client below the persistent one.
   */
  waitingSince: Date | null;
  /** Messages they've sent since he last replied. */
  unanswered: number;
  /** Messages he has never opened. Overlaps with the above, deliberately. */
  unread: number;
};

/**
 * Thresholds picked off how a coach's day actually runs, not round numbers.
 *
 * Same-day is normal — he batches replies between sessions, and a two-hour gap
 * is him working, not him slipping. Past a half day it stops looking like a
 * queue and starts looking like being ignored, and past two days the client has
 * usually stopped expecting an answer and quietly stopped logging too.
 */
export function waitLevel(since: Date | null, now: Date): WaitLevel {
  if (!since) return 'fresh';
  const hours = (now.getTime() - since.getTime()) / 3_600_000;
  if (hours < 3) return 'fresh';
  if (hours < 12) return 'today';
  if (hours < 48) return 'stale';
  return 'cold';
}

/** Compact enough to sit at the end of a row without wrapping on a phone. */
export function waitLabel(since: Date | null, now: Date): string {
  if (!since) return '';
  const mins = Math.max(0, Math.round((now.getTime() - since.getTime()) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return `${days}d`;
}

/*
  The grouped rows this module joins, named so the assembly below can be
  exercised without a database.

  Worth the four type aliases: the offline Prisma stub types every groupBy as
  `any[]`, so nothing about these shapes is checked at the call site and a
  typecheck pass proves nothing about the join. Stating them here is what
  makes the tests mean something.
*/

/** Newest message in one direction of one thread. */
export type Edge = { senderId: string; recipientId: string; _max: { createdAt: Date | null } };

/** Start and size of one client's unanswered run. */
export type Run = { senderId: string; _min: { createdAt: Date | null }; _count: { _all: number } };

/** A candidate for the preview line. More are fetched than are used. */
export type Preview = {
  senderId: string;
  recipientId: string;
  body: string | null;
  createdAt: Date;
};

export type Person = { clientId: string; name: string; avatarUrl?: string | null };

/*
  First + LAST initial, matching src/lib/console.ts.

  This started as first + second, which turns "Mary Jane Watson" into MJ on
  the inbox and MW on the dashboard — the same person with two different
  avatars on two screens. Not re-exported from console.ts because that module
  imports Prisma and this one is deliberately free of it.
*/
export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return (first + last).toUpperCase();
}

/**
 * Grouped edges into "when did each side last speak".
 *
 * A thread arrives as two groups, his direction and theirs, which is the
 * whole reason one groupBy answers the question for the entire roster.
 */
export function splitEdges(coachId: string, edges: Edge[]) {
  const mine = new Map<string, Date>();
  const theirs = new Map<string, Date>();
  for (const e of edges) {
    const at = e._max.createdAt;
    if (!at) continue;
    if (e.senderId === coachId) mine.set(e.recipientId, at);
    else theirs.set(e.senderId, at);
  }
  return { mine, theirs };
}

/**
 * Waiting means their last message is newer than his.
 *
 * The never-replied case counts too, and is the worst version of it: someone
 * who has written and been met with nothing at all.
 */
export function waitingIdsFrom(
  clientIds: string[],
  mine: Map<string, Date>,
  theirs: Map<string, Date>
): string[] {
  return clientIds.filter((id) => {
    const t = theirs.get(id);
    if (!t) return false;
    const m = mine.get(id);
    return !m || t > m;
  });
}

/**
 * The preview line for each thread, newest wins.
 *
 * The fetch that produces these matches on a set of timestamps drawn from
 * every thread, so a message can come back that is merely contemporaneous
 * with some other thread's newest. Taking the newest per person is what makes
 * that over-fetch harmless: every thread's real newest is always in the set
 * too, so it always wins.
 */
export function previewsByPerson(coachId: string, rows: Preview[]) {
  const out = new Map<string, { body: string | null; at: Date }>();
  for (const m of rows) {
    const other = m.senderId === coachId ? m.recipientId : m.senderId;
    const held = out.get(other);
    if (!held || m.createdAt > held.at) out.set(other, { body: m.body, at: m.createdAt });
  }
  return out;
}

/** The whole join, given every piece. No database, no clock. */
export function assembleThreads(input: {
  coachId: string;
  people: Person[];
  edges: Edge[];
  runs: Run[];
  previews: Preview[];
  unreadBy: Map<string, number>;
}): WaitingThread[] {
  const { coachId, people, edges, runs, previews, unreadBy } = input;

  const { mine, theirs } = splitEdges(coachId, edges);
  const waitingIds = new Set(waitingIdsFrom(people.map((p) => p.clientId), mine, theirs));
  const runBy = new Map(runs.map((r) => [r.senderId, r]));
  const preview = previewsByPerson(coachId, previews);

  return sortThreads(
    people.map((p) => {
      const waiting = waitingIds.has(p.clientId);
      const run = runBy.get(p.clientId);
      const last = preview.get(p.clientId);
      return {
        clientId: p.clientId,
        name: p.name,
        initials: initialsOf(p.name),
        avatarUrl: p.avatarUrl ?? null,
        lastBody: last?.body ?? null,
        lastAt: last?.at ?? null,
        waiting,
        waitingSince: waiting ? run?._min.createdAt ?? null : null,
        unanswered: waiting ? run?._count._all ?? 0 : 0,
        unread: unreadBy.get(p.clientId) ?? 0,
      };
    })
  );
}

/**
 * Waiting threads first and longest-wait first inside them.
 *
 * The meals queue already sorts oldest-first for the same reason: the person
 * who has been unanswered since breakfast is the one the screen exists for,
 * and newest-first spends every load burying them one row deeper. Everything
 * not waiting falls below and sorts by recency, because for those rows the
 * only useful question is what happened most recently.
 */
export function sortThreads<T extends WaitingThread>(threads: T[]): T[] {
  return [...threads].sort((a, b) => {
    if (a.waiting !== b.waiting) return a.waiting ? -1 : 1;
    if (a.waiting && b.waiting) {
      const at = a.waitingSince?.getTime() ?? 0;
      const bt = b.waitingSince?.getTime() ?? 0;
      return at - bt;
    }
    return (b.lastAt?.getTime() ?? 0) - (a.lastAt?.getTime() ?? 0);
  });
}
