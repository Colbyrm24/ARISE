import { firstName } from '@/lib/activity';

/*
  The consistency board.

  Deliberately narrow. A leaderboard between people who share a coach is a
  motivating thing or a humiliating one depending entirely on what it ranks,
  and the decision here was consistency and nothing else — never weight, never
  photos, never macros. Somebody 40 lb from their goal who logs every single
  day should be top of this board, and the whole point is lost if it can be
  read as a body-fat ranking with extra steps.

  So an entry carries a first name, a rank and a percentage. There is nowhere
  in the type to put anything else, which is the cheapest way to make sure
  nothing else ever ends up on screen.
*/

export type BoardRow = {
  clientId: string;
  fullName: string | null;
  /** Distinct days in the window with any logged activity. */
  activeDays: number;
};

export type BoardEntry = {
  clientId: string;
  name: string;
  rank: number;
  activeDays: number;
  percent: number;
  /** True for the person looking at the board. */
  isViewer: boolean;
};

/**
 * Days active out of days possible, rounded.
 *
 * Capped at 100 because the window is inclusive at both ends and a client in
 * a timezone ahead of the server can log a day the window has not formally
 * started yet — a 103% consistency score reads as a bug, not as enthusiasm.
 */
export function consistencyPercent(activeDays: number, windowDays: number) {
  if (windowDays <= 0) return 0;
  return Math.min(100, Math.round((activeDays / windowDays) * 100));
}

/**
 * Orders the board and assigns ranks.
 *
 * Ties share a rank and the next rank skips — three people on 28 days are all
 * 2nd and the next is 5th. Standard competition ranking, and the alternative
 * (giving tied people different numbers) means somebody is told they are
 * behind a person they are level with.
 *
 * Ties are then ordered by name so the board doesn't reshuffle between page
 * loads. Nothing is more corrosive to a leaderboard than positions that move
 * when nothing happened.
 */
export function rankBoard(
  rows: BoardRow[],
  windowDays: number,
  viewerId?: string
): BoardEntry[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.activeDays - a.activeDays ||
      firstName(a.fullName).localeCompare(firstName(b.fullName)) ||
      a.clientId.localeCompare(b.clientId)
  );

  let rank = 0;
  let previous: number | null = null;

  return sorted.map((row, i) => {
    if (previous === null || row.activeDays !== previous) {
      rank = i + 1;
      previous = row.activeDays;
    }
    return {
      clientId: row.clientId,
      name: firstName(row.fullName),
      rank,
      activeDays: row.activeDays,
      percent: consistencyPercent(row.activeDays, windowDays),
      isViewer: row.clientId === viewerId,
    };
  });
}

/**
 * What to show a client who would otherwise scroll past themselves.
 *
 * A board of thirty is a wall, and the row that matters most to somebody is
 * their own. This returns the top few plus the viewer's own row when it falls
 * outside them, so the screen always answers "where am I" without a scroll.
 */
export function boardView(entries: BoardEntry[], top = 10) {
  const head = entries.slice(0, top);
  const viewer = entries.find((e) => e.isViewer);
  const viewerInHead = viewer ? head.some((e) => e.clientId === viewer.clientId) : true;
  return { head, trailing: viewerInHead ? null : (viewer ?? null) };
}
