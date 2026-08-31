import { PHOTO_ANGLES } from '@/lib/progress-photos';

/*
  Then against now.

  The photo grid shows every shoot newest-first, which answers "what have I
  taken" and not the only question anyone actually opens this screen for:
  am I different. Scrolling to the bottom to find February and holding it in
  your head while you scroll back up is not a comparison — and for a client
  who has been at it a while the first shoot isn't even loaded, because the
  grid takes the newest two dozen.

  So the pairing is explicit: for each angle, the earliest photo on file and
  the most recent one, side by side, with the gap between them named. This
  half is pure — which photo pairs with which is the part that goes wrong,
  and it goes wrong quietly.
*/

export type ComparePhoto = {
  id: string;
  date: Date;
  angle: string;
  url: string | null;
};

export type ComparePair = {
  angle: string;
  first: ComparePhoto;
  latest: ComparePhoto;
  /** Whole days between the two shoots. */
  daysApart: number;
};

const DAY = 86400000;

/**
 * Pairs each angle's earliest photo with its most recent.
 *
 * Angles come back in PHOTO_ANGLES order rather than whatever order the
 * database happened to return, so front is always the first thing seen and
 * the row doesn't reshuffle between visits.
 *
 * An angle is skipped when both ends are the same shoot — one photo compared
 * against itself is a mirror, not progress, and drawing it twice under a
 * "then and now" heading reads as a bug.
 */
export function comparePairs(
  earliest: ComparePhoto[],
  latest: ComparePhoto[]
): ComparePair[] {
  const out: ComparePair[] = [];

  for (const angle of PHOTO_ANGLES) {
    // Earliest and latest for this angle, taken from each list rather than
    // assumed to be sorted — the caller's ORDER BY is not this function's
    // business to trust.
    const firsts = earliest.filter((p) => p.angle === angle);
    const lasts = latest.filter((p) => p.angle === angle);
    if (firsts.length === 0 || lasts.length === 0) continue;

    const first = firsts.reduce((a, b) => (a.date <= b.date ? a : b));
    const last = lasts.reduce((a, b) => (a.date >= b.date ? a : b));

    if (first.id === last.id) continue;

    out.push({
      angle,
      first,
      latest: last,
      daysApart: Math.max(0, Math.round((last.date.getTime() - first.date.getTime()) / DAY)),
    });
  }

  return out;
}

/**
 * How long the change took, in the units a person would say out loud.
 *
 * "84 days" is a number to convert; "12 weeks" is the thing somebody tells
 * their friend. Weeks up to a year because that is how training blocks are
 * counted, and this is a training app.
 */
export function spanLabel(days: number) {
  if (days < 14) return `${days} day${days === 1 ? '' : 's'} apart`;
  if (days < 365) {
    const weeks = Math.round(days / 7);
    return `${weeks} week${weeks === 1 ? '' : 's'} apart`;
  }
  const years = Math.floor(days / 365);
  const months = Math.round((days % 365) / 30);
  if (months === 0) return `${years} year${years === 1 ? '' : 's'} apart`;
  return `${years}y ${months}m apart`;
}
